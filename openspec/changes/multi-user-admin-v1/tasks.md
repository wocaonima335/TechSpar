# TechSpar 多用户与管理员后台 V1 实施任务清单

本任务清单对应“独立账号制 + 用户/内容管理后台 + 账号密码/JWT”的 V1 改造方案。

说明：

- 该清单单独落在 `openspec/changes/multi-user-admin-v1/`，避免与现有 `agent-architecture-refactor` 变更混淆。
- 默认技术基线保持不变：`FastAPI + React + SQLite + 本地文件存储`。
- 本版已补齐当前仓库新增链路带来的改造范围，包括 `graph`、`due-reviews`、`transcribe`、`spaced_repetition` 和用户级画像辅助函数。
- 推荐实施顺序：`范围冻结 -> 依赖与配置 -> 数据库/启动迁移 -> 认证鉴权 -> 用户隔离 -> 接口收口 -> 前端登录态与路由 -> 页面改造 -> 联调验证 -> 收尾`。

## 0. 范围冻结

- [ ] 明确本期只做 `admin` / `member` 两类角色，不引入组织、团队、共享空间、游客模式或 SSO。
- [ ] 明确本期不做公开注册、邮箱验证码、忘记密码、第三方登录。
- [ ] 明确 `data/knowledge`、`data/high_freq`、`data/topics.json` 继续作为全局内容资产，由管理员维护。
- [ ] 明确普通用户只能访问自己的简历、画像、insights、训练历史、review、待复习弱项、题目图谱和进行中的会话。
- [ ] 明确 `graph`、`due-reviews`、`transcribe` 都属于登录后用户能力，不保留匿名访问。

## 1. 依赖与配置

### 1.1 后端依赖

- [ ] 更新 `requirements.txt`，新增 `python-jose[cryptography]` 用于 JWT 签发与校验。
- [ ] 更新 `requirements.txt`，新增 `passlib[bcrypt]` 用于密码哈希。

### 1.2 后端配置

- [ ] 更新 `backend/config.py`，新增认证配置项：
  - `jwt_secret`
  - `jwt_expire_minutes`
  - `admin_username`
  - `admin_password`
- [ ] 在 `backend/config.py` 中增加用户级路径 helper：
  - `get_resume_dir(user_id: str) -> Path`
  - `get_resume_file(user_id: str) -> Path`
  - `get_profile_dir(user_id: str) -> Path`
  - `get_profile_path(user_id: str) -> Path`
  - `get_insights_dir(user_id: str) -> Path`
  - `get_resume_cache_dir(user_id: str) -> Path`
- [ ] 更新 `.env.example`，补充管理员初始化与 JWT 所需环境变量说明。

## 2. 数据库与启动期迁移

### 2.1 新建与补列

- [ ] 新建 `backend/storage/users.py`，负责 `users` 表的建表与 CRUD。
- [ ] 在数据库 bootstrap 过程中创建 `users` 表，字段固定为：
  - `id`
  - `username`
  - `display_name`
  - `password_hash`
  - `role`
  - `status`
  - `created_at`
  - `last_login_at`
- [ ] 为 `users.username` 建唯一索引。
- [ ] 为 `users.role`、`users.status` 建辅助索引。
- [ ] 在 `backend/storage/sessions.py` 的建表 / 迁移逻辑中为 `sessions` 增加 `user_id` 列。
- [ ] 为 `sessions(user_id, created_at)` 建索引。
- [ ] 在 `backend/vector_memory.py` 的建表 / 迁移逻辑中为 `memory_vectors` 增加 `user_id` 列。
- [ ] 为 `memory_vectors(user_id, chunk_type)` 和 `memory_vectors(user_id, topic)` 建索引。
- [ ] 评估 `backend/graph.py` 使用的 `question_embeddings` 表是否保持全局缓存；若保持全局，需在任务说明里明确它只缓存题目文本 embedding，不承担用户隔离语义。

### 2.2 启动期迁移入口

- [ ] 新建 `backend/bootstrap.py`，集中处理：
  - 建表
  - 补列
  - 初始化管理员
  - 历史数据归档
  - 旧文件迁移
  - 旧索引清理与重建
- [ ] 在 `backend/main.py` 的 startup 流程最前面接入 `bootstrap`，确保迁移先于业务服务运行。
- [ ] 调整 startup 行为，移除“默认按全局 profile 重建向量索引”的旧路径，避免在未确定 `user_id` 时继续操作全局画像。

### 2.3 初始化管理员

- [ ] 从 `ADMIN_USERNAME`、`ADMIN_PASSWORD` 读取管理员初始化信息。
- [ ] 若数据库中不存在管理员，则创建首个 `admin` 用户。
- [ ] 若管理员已存在，则跳过重复初始化，不覆盖旧密码。

### 2.4 旧数据迁移

- [ ] 迁移旧的全局简历目录：
  - 源：`data/resume/*.pdf`
  - 目标：`data/resume/<admin_user_id>/resume.pdf`
- [ ] 迁移旧的全局画像文件：
  - 源：`data/user_profile/profile.json`
  - 目标：`data/user_profile/<admin_user_id>/profile.json`
- [ ] 迁移旧的 insights：
  - 源：`data/user_profile/insights/*`
  - 目标：`data/user_profile/<admin_user_id>/insights/`
- [ ] 回填旧 `sessions.user_id`，全部挂到初始化管理员名下。
- [ ] 回填旧 `memory_vectors.user_id`，全部挂到初始化管理员名下。
- [ ] 删除旧的全局 resume 索引缓存目录，避免和新的用户目录混用。
- [ ] 在迁移完成后，为管理员执行一次用户级画像 / 弱项向量索引重建。

## 3. 后端认证与权限模型

### 3.1 安全模块

- [ ] 新建 `backend/security.py`，实现：
  - 密码哈希
  - 密码校验
  - access token 生成
  - access token 解析
  - `get_current_user`
  - `require_admin`

### 3.2 数据模型

- [ ] 更新 `backend/models.py`，新增：
  - `UserRole`
  - `UserStatus`
  - `LoginRequest`
  - `AuthUser`
  - `AdminUserCreateRequest`
  - `AdminUserUpdateRequest`
  - `ResetPasswordRequest`
- [ ] 保持现有训练相关请求模型不变，用户身份不从请求体传递，而从 JWT 中解析。

### 3.3 认证接口

- [ ] 在 `backend/main.py` 新增 `POST /api/auth/login`。
- [ ] 在 `backend/main.py` 新增 `GET /api/auth/me`。
- [ ] 登录成功后更新 `users.last_login_at`。
- [ ] 登录返回固定结构：
  - `access_token`
  - `token_type`
  - `user`

## 4. 后端用户隔离改造

### 4.1 Session 存储层

- [ ] 修改 `backend/storage/sessions.py` 的 `create_session()`，新增 `user_id` 参数并持久化。
- [ ] 修改 `append_message()`，在更新前校验 session 所有者。
- [ ] 修改 `save_drill_answers()`，按 `session_id + user_id` 定位。
- [ ] 修改 `save_review()`，按 `session_id + user_id` 定位。
- [ ] 修改 `get_session()`，只返回当前用户拥有的 session。
- [ ] 修改 `list_sessions_by_topic()`，新增 `user_id` 过滤。
- [ ] 修改 `list_sessions()`，新增 `user_id` 过滤。
- [ ] 修改 `delete_session()`，只允许删除当前用户自己的 session。
- [ ] 修改 `list_distinct_topics()`，只统计当前用户已完成会话中的 topic。

### 4.2 画像与记忆

- [ ] 修改 `backend/memory.py` 的全局路径常量写法，不再绑定单一 `PROFILE_PATH`。
- [ ] 修改 `_load_profile(user_id)`，按用户读取 `profile.json`。
- [ ] 修改 `_save_profile(user_id, profile)`，按用户写入 `profile.json`。
- [ ] 修改 `_save_insight(user_id, ...)`，按用户写入 `insights`。
- [ ] 修改 `get_profile(user_id)`。
- [ ] 修改 `get_topic_context_for_drill(user_id, topic)`。
- [ ] 修改 `update_profile_realtime(user_id, ...)`。
- [ ] 修改 `llm_update_profile(user_id, ...)`。
- [ ] 修改 `update_profile_after_interview(user_id, ...)`。
- [ ] 补齐当前遗漏的辅助函数改造：
  - `get_profile_summary(user_id)`
  - `get_profile_summary_for_drill(user_id)`

### 4.3 间隔重复与弱项复习

- [ ] 修改 `backend/spaced_repetition.py` 的 `get_due_reviews(user_id, topic=None)`，只读取当前用户画像。
- [ ] 修改 `update_weak_point_sr(user_id, topic, point_text, score)`，只更新当前用户弱项复习状态。
- [ ] 修改 `init_sr_for_existing_points(user_id)`，避免初始化其他用户的弱项数据。

### 4.4 向量记忆

- [ ] 修改 `backend/vector_memory.py` 的 `init_memory_table()`，补 `user_id` 迁移逻辑。
- [ ] 修改 `index_session_memory(user_id, ...)`，写入用户维度。
- [ ] 修改 `search_memory(user_id, ...)`，查询必须带用户过滤。
- [ ] 修改 `find_similar_weak_point(user_id, ...)`，相似弱项去重不能跨用户。
- [ ] 修改 `rebuild_index_from_profile(user_id)`，只重建单个用户画像相关向量。

### 4.5 Resume 与索引

- [ ] 修改 `backend/indexer.py` 的 `build_resume_index(user_id, force_rebuild=False)`。
- [ ] 修改 `backend/indexer.py` 的 `_index_cache` 使用方式，将 resume cache key 改为 `resume:<user_id>`。
- [ ] 修改 `backend/indexer.py` 的 resume cache 持久化目录，改为 `data/.index_cache/resume/<user_id>/...`。
- [ ] 修改 `query_resume(user_id, question, top_k=3)`。
- [ ] 保持 topic knowledge index 为全局共享，不按用户拆分。

### 4.6 Graph 与训练链路

- [ ] 修改 `backend/graphs/resume_interview.py` 的 `compile_resume_interview(user_id)`。
- [ ] 修改 `backend/graphs/resume_interview.py` 中对 `query_resume()` 和 `get_profile_summary()` 的调用，显式传入 `user_id`。
- [ ] 修改 `backend/graphs/topic_drill.py` 的 `generate_drill_questions(user_id, topic)`。
- [ ] 修改 `backend/graphs/topic_drill.py` 中对 `get_topic_context_for_drill()`、`get_profile_summary_for_drill()`、`search_memory()` 的调用，显式传入 `user_id`。
- [ ] 修改 `backend/graphs/topic_drill.py` 中对 `get_due_reviews()`、`init_sr_for_existing_points()` 的调用，显式传入 `user_id`。
- [ ] 修改 `backend/graph.py` 的 `build_graph(user_id, topic)`，只读取当前用户已完成的 drill 记录构图。

## 5. 后端接口收口

### 5.1 现有用户接口改造

- [ ] 在 `backend/main.py` 中为以下接口挂上当前用户依赖：
  - `/api/resume/status`
  - `/api/resume/upload`
  - `/api/profile`
  - `/api/profile/due-reviews`
  - `/api/profile/topic/{topic}/history`
  - `/api/profile/topic/{topic}/retrospective`
  - `/api/interview/start`
  - `/api/interview/chat`
  - `/api/interview/end/{session_id}`
  - `/api/interview/review/{session_id}`
  - `/api/interview/history`
  - `/api/interview/session/{session_id}`
  - `/api/interview/topics`
  - `/api/graph/{topic}`
  - `/api/transcribe`
- [ ] 将 `/api/resume/status` 与 `/api/resume/upload` 改为读取当前用户的 resume 目录。
- [ ] 将 `/api/profile*`、`/api/interview*`、`/api/graph/{topic}`、`/api/transcribe` 全部改为按当前用户读写，不接受跨用户访问。
- [ ] 修改 `_graphs` 和 `_drill_sessions` 的内存结构，记录 `owner_user_id`。
- [ ] 在 `/api/interview/chat`、`/api/interview/end/{session_id}`、`/api/interview/review/{session_id}` 中校验当前用户与 session owner 一致。

### 5.2 管理员接口

- [ ] 在 `backend/main.py` 新增管理员用户管理接口：
  - `GET /api/admin/users`
  - `POST /api/admin/users`
  - `PATCH /api/admin/users/{user_id}`
  - `POST /api/admin/users/{user_id}/reset-password`
- [ ] 在 `backend/main.py` 新增管理员内容管理接口：
  - `POST /api/admin/topics`
  - `DELETE /api/admin/topics/{key}`
  - `POST /api/admin/knowledge/{topic}/core`
  - `PUT /api/admin/knowledge/{topic}/core/{filename}`
  - `DELETE /api/admin/knowledge/{topic}/core/{filename}`
  - `PUT /api/admin/knowledge/{topic}/high_freq`
- [ ] 所有 `/api/admin/*` 接口统一挂 `require_admin`。

### 5.3 旧写接口收敛

- [ ] 将原普通路径下的 topics / knowledge 写接口迁移为管理员接口，不再允许普通用户直接写全局知识库。
- [ ] 保留普通用户对 `topics`、`knowledge` 的只读访问能力。

## 6. 前端登录态与路由改造

### 6.1 前端基础设施

- [ ] 新建 `frontend/src/api/client.js`，统一处理：
  - API base
  - Bearer token 注入
  - 401 统一处理
  - 错误文本提取
- [ ] 新建 `frontend/src/api/auth.js`，封装 `login()` 与 `getMe()`。
- [ ] 新建 `frontend/src/api/admin.js`，封装管理员接口。
- [ ] 修改 `frontend/src/api/interview.js`，改走 `client.js`，只保留用户侧训练与只读接口，并补齐 `due-reviews`、`graph`、`transcribe` 的统一访问方式。

### 6.2 认证上下文

- [ ] 新建 `frontend/src/context/AuthContext.jsx`，统一管理：
  - `access_token`
  - `currentUser`
  - `login`
  - `logout`
  - `restoreSession`
- [ ] 修改 `frontend/src/main.jsx`，用 `AuthProvider` 包裹 `App`。

### 6.3 路由守卫

- [ ] 新建 `frontend/src/components/ProtectedRoute.jsx`，未登录跳转 `/login`。
- [ ] 新建 `frontend/src/components/AdminRoute.jsx`，非管理员禁止访问后台页面。
- [ ] 修改 `frontend/src/App.jsx`，新增路由：
  - `/login`
  - `/admin/users`
  - `/admin/content`
- [ ] 修改 `frontend/src/App.jsx`，让用户工作台页面全部经过 `ProtectedRoute`：
  - `/`
  - `/interview/:sessionId`
  - `/review/:sessionId`
  - `/history`
  - `/profile`
  - `/profile/topic/:topic`
  - `/knowledge`
  - `/graph`
- [ ] 修改 `frontend/src/App.jsx`，让管理员页面经过 `AdminRoute`。

## 7. 前端页面改造

### 7.1 用户侧页面

- [ ] 新建 `frontend/src/pages/Login.jsx`，提供账号密码登录页。
- [ ] 修改 `frontend/src/components/Header.jsx`，增加：
  - 当前用户展示名
  - 角色标识
  - 退出登录入口
  - 管理员后台入口（仅 `admin` 可见）
- [ ] 修改 `frontend/src/pages/Home.jsx`，移除直接 `fetch('/api/profile')` 的写法，统一走 API 模块。
- [ ] 修改 `frontend/src/pages/Interview.jsx`，全部改为通过带 token 的 client 请求后端。
- [ ] 修改 `frontend/src/hooks/useVoiceInput.js`，语音转写走带 token 的 client。
- [ ] 修改 `frontend/src/pages/History.jsx`，显示当前用户自己的历史记录。
- [ ] 修改 `frontend/src/pages/Profile.jsx`，显示当前用户自己的画像。
- [ ] 修改 `frontend/src/pages/TopicDetail.jsx`，只加载当前用户在该 topic 下的历史与 retrospective。
- [ ] 修改 `frontend/src/pages/Review.jsx`，处理无权限访问他人 session 时的错误态。
- [ ] 修改 `frontend/src/pages/Graph.jsx`，只展示当前用户自己的题目图谱。

### 7.2 知识库与后台

- [ ] 修改 `frontend/src/pages/Knowledge.jsx`，收敛为普通用户只读知识浏览页。
- [ ] 从 `Knowledge.jsx` 中移除 topics / core knowledge / high_freq 的增删改按钮与弹窗。
- [ ] 新建 `frontend/src/pages/admin/AdminUsers.jsx`，承接用户管理能力：
  - 用户列表
  - 创建用户
  - 禁用 / 启用用户
  - 修改角色
  - 重置密码
- [ ] 新建 `frontend/src/pages/admin/AdminContent.jsx`，承接内容管理能力：
  - topic 创建 / 删除
  - core knowledge 新增 / 编辑 / 删除
  - high frequency question bank 编辑

## 8. 联调验证

### 8.1 冷启动与迁移

- [ ] 空库启动时自动创建管理员账号。
- [ ] 已有旧数据时，启动不会报错，且旧 session、旧画像、旧简历、旧 insights、旧弱项向量都被归档到管理员名下。
- [ ] 迁移后管理员能够正常看到旧的历史记录和画像数据。

### 8.2 认证流

- [ ] 正确账号密码可以登录。
- [ ] 错误密码返回 401。
- [ ] 被禁用用户不能登录。
- [ ] 前端刷新后能通过 `/api/auth/me` 恢复登录态。
- [ ] 退出登录后再次访问受保护页面会跳回 `/login`。

### 8.3 数据隔离

- [ ] 用户 A 不能读取用户 B 的 session。
- [ ] 用户 A 不能删除用户 B 的 session。
- [ ] 用户 A 不能访问用户 B 的 review。
- [ ] 用户 A 的画像、弱项、待复习项和历史不会影响用户 B 的题目生成与画像更新。
- [ ] 不同用户上传不同简历后，resume index 不串缓存。
- [ ] `/api/profile/due-reviews` 只返回当前用户的待复习弱项。
- [ ] `/api/graph/{topic}` 只基于当前用户已完成的 drill 记录构图。

### 8.4 权限

- [ ] 普通用户访问任意 `/api/admin/*` 返回 403。
- [ ] 普通用户在前端看不到管理员后台入口。
- [ ] 普通用户无法编辑全局 topic / knowledge / high_freq。
- [ ] 管理员可以正常新增用户、禁用用户、重置密码、维护 topic 和知识库。
- [ ] `/api/transcribe` 在未登录时返回符合预期的鉴权错误，在登录后可正常使用。

### 8.5 主流程回归

- [ ] 登录后上传简历正常。
- [ ] Resume interview 正常开始、对话、结束、生成 review。
- [ ] Topic drill 正常开始、结束、生成 review。
- [ ] 历史记录分页与 topic 过滤正常。
- [ ] 画像页、topic detail 页、review 页全部在登录态下正常工作。
- [ ] Graph 页在登录态下正常工作，且不读取其他用户数据。
- [ ] 语音输入链路在登录态下正常转写并回填到会话。

## 9. 收尾

- [ ] 更新 `README.md`，说明：
  - 首次启动管理员初始化方式
  - 默认无公开注册
  - 知识库由管理员维护
  - 用户数据已按账号隔离
  - `graph`、`due-reviews`、`transcribe` 现为登录后能力
- [ ] 补充最小手工验收记录，至少覆盖管理员登录、创建普通用户、普通用户训练、普通用户图谱 / 弱项复习、管理员编辑知识库五条链路。
- [ ] 在提交前确认没有把明文密码、JWT secret 或其他敏感值写入仓库。
