# TechSpar 服务器 Docker 部署与多用户鉴权冒烟测试文档

本文档用于在远程服务器上以 Docker Compose 方式部署 TechSpar，并基于当前多用户鉴权实现完成最小可复现的冒烟测试。

适用场景：
- 本地环境无法完整部署，需要在服务器上验证当前分支是否可运行。
- 服务器将以 Docker 作为标准部署方式，而不是宿主机 `venv + uvicorn + Vite dev server`。
- 需要验证当前多用户改造后的关键行为是否正常：
  - 匿名访问受保护接口会被拦截。
  - 管理员账号可以正常登录并获取 JWT。
  - 带 token 后可以访问用户接口。
  - 管理员 token 可以访问 `/api/admin/*` 接口。
  - 前端容器可以通过 Nginx 代理转发 `/api/*` 到后端容器。

执行约定：
- 以下命令默认在服务器上执行。
- 当前项目目录假设为 `/root/TechSpar`。
- 建议按章节顺序逐段执行，不要整篇一次性粘贴。
- `.env` 中的真实密钥不要回贴到聊天里。

---

## 1. 启动前检查

先确认仓库位置、Docker 运行时、磁盘、内存和端口占用情况。

```bash
cd /root/TechSpar

echo '=== REPO ==='
pwd
git status --short --branch
git rev-parse --short HEAD

echo
echo '=== DOCKER ==='
docker --version
docker compose version

echo
echo '=== SYSTEM ==='
free -h
df -h
ss -ltnp | grep -E ':80 |:8000 ' || true
```

期望结果：
- 当前目录是 `/root/TechSpar`
- `docker` 和 `docker compose` 可用
- 磁盘空间和内存没有明显不足
- `80` 和 `8000` 端口没有被意外占用

---

## 2. 环境变量检查

当前 Docker Compose 会把根目录 `.env` 注入后端容器。多用户鉴权上线后，除了原有 LLM 配置，还必须关注 `JWT_SECRET` 和 `ADMIN_PASSWORD`。

```bash
cd /root/TechSpar

[ -f .env ] || cp .env.example .env

echo '=== ENV KEYS ==='
grep -E '^(API_BASE|API_KEY|MODEL|JWT_SECRET|JWT_EXPIRE_MINUTES|ADMIN_USERNAME|ADMIN_PASSWORD|EMBEDDING_API_BASE|EMBEDDING_API_KEY|EMBEDDING_MODEL)=' .env \
| sed 's/API_KEY=.*/API_KEY=***MASKED***/' \
| sed 's/EMBEDDING_API_KEY=.*/EMBEDDING_API_KEY=***MASKED***/' \
| sed 's/JWT_SECRET=.*/JWT_SECRET=***MASKED***/' \
| sed 's/ADMIN_PASSWORD=.*/ADMIN_PASSWORD=***MASKED***/'
```

必须补齐的关键项：
- `API_BASE=`
- `API_KEY=`
- `MODEL=`
- `JWT_SECRET=`
- `ADMIN_PASSWORD=`

说明：
- `ADMIN_USERNAME` 默认可为 `admin`，如未特别修改，建议保持默认值。
- 如果不配置 `EMBEDDING_API_BASE`，后端启动时会尝试本地加载 `BAAI/bge-m3`。服务器如果无法访问 HuggingFace，启动可能卡在 embedding 初始化阶段。

---

## 3. Compose 配置预检查

在真正启动前，先做一次 Compose 配置校验，尽早暴露语法或变量缺失问题。

```bash
cd /root/TechSpar

docker compose config > /dev/null
docker compose config --services
sed -n '1,80p' docker-compose.yml
```

期望结果：
- `docker compose config` 正常退出
- 能看到 `backend` 和 `frontend` 两个服务名
- `backend` 暴露 `8000:8000`
- `frontend` 暴露 `80:80`
- `backend` 使用 `.env`

说明：
- 这里不直接输出完整渲染结果，避免把 `.env` 中的敏感值展开到终端或日志里。

---

## 4. Docker 构建与启动

### 4.1 拉起服务

```bash
cd /root/TechSpar

docker compose up -d --build
docker compose ps
```

### 4.2 查看启动日志

```bash
cd /root/TechSpar

echo '=== BACKEND LOG ==='
docker compose logs --tail 200 backend

echo
echo '=== FRONTEND LOG ==='
docker compose logs --tail 120 frontend
```

期望结果：
- `backend` 和 `frontend` 都处于 `Up` 状态
- 后端日志里没有明显的 `ImportError`、`.env` 缺失、`JWT_SECRET is not configured` 或 `ADMIN_PASSWORD is required` 报错
- 前端日志里没有 Nginx 配置错误

---

## 5. 基础存活检查

先验证容器和端口已正常工作，但暂时不带登录态。

```bash
echo '=== BACKEND ROOT ==='
curl -sS http://127.0.0.1:8000/api/
echo
echo

echo '=== FRONTEND ROOT HEADERS ==='
curl -I http://127.0.0.1/
echo

echo '=== PORTS ==='
ss -ltnp | grep -E ':80 |:8000 '
```

最小成功标准：
- `GET http://127.0.0.1:8000/api/` 返回服务信息
- `GET http://127.0.0.1/` 返回前端容器响应头
- `80` 和 `8000` 端口都已监听

---

## 6. 未登录鉴权检查

这一步是“多用户鉴权感知”的第一层验证，重点看匿名请求是否会被后端正确拦截。

```bash
echo '=== PROFILE WITHOUT TOKEN ==='
curl -i http://127.0.0.1:8000/api/profile
echo
echo

echo '=== TOPICS WITHOUT TOKEN ==='
curl -i http://127.0.0.1:8000/api/topics
echo
echo

echo '=== ADMIN USERS WITHOUT TOKEN ==='
curl -i http://127.0.0.1:8000/api/admin/users
```

期望结果：
- `/api/profile` 返回 `401`
- `/api/topics` 返回 `401`
- `/api/admin/users` 返回 `401`

说明：
- 这说明受保护接口已经从“单用户默认开放”切换为“必须先登录再访问”。

---

## 7. 管理员登录并提取 JWT

当前系统启动后会根据 `.env` 中的 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 准备管理员账号。这里用管理员账号做最小登录验证。

```bash
cd /root/TechSpar

ADMIN_USERNAME="$(grep '^ADMIN_USERNAME=' .env | cut -d= -f2-)"
ADMIN_PASSWORD="$(grep '^ADMIN_PASSWORD=' .env | cut -d= -f2-)"

if [ -z "$ADMIN_USERNAME" ]; then
  ADMIN_USERNAME=admin
fi

LOGIN_RESPONSE=$(curl -sS -X POST http://127.0.0.1:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USERNAME\",\"password\":\"$ADMIN_PASSWORD\"}")

ACCESS_TOKEN=$(printf '%s' "$LOGIN_RESPONSE" \
  | tr -d '\n' \
  | grep -oE '"access_token"[[:space:]]*:[[:space:]]*"[^"]+"' \
  | head -n 1 \
  | sed -E 's/.*"([^"]+)"/\1/')

echo '=== LOGIN RESPONSE MASKED ==='
printf '%s\n' "$LOGIN_RESPONSE" \
  | sed -E 's/("access_token"[[:space:]]*:[[:space:]]*")[^"]+/\1***MASKED***/'
echo

echo '=== TOKEN LENGTH ==='
printf '%s\n' "${#ACCESS_TOKEN}"
```

期望结果：
- 登录响应里包含 `access_token`
- 返回的 `user.role` 为 `admin`
- `TOKEN LENGTH` 大于 `0`

注意：
- 不要把真实 `ACCESS_TOKEN` 原文回贴到聊天里。

如果 `ACCESS_TOKEN` 为空：
- 优先检查 `ADMIN_PASSWORD` 是否与当前数据库中管理员密码一致
- 再检查后端日志里是否出现 `JWT_SECRET is not configured`
- 再确认 `.env` 是否确实被 Compose 注入了后端容器

---

## 8. 带 Token 的用户态接口冒烟测试

这一步验证登录后的 JWT 能否被后端识别，并正确恢复当前用户。

```bash
echo '=== AUTH ME ==='
curl -sS http://127.0.0.1:8000/api/auth/me \
  -H "Authorization: Bearer $ACCESS_TOKEN"
echo
echo

echo '=== PROFILE WITH TOKEN ==='
curl -sS http://127.0.0.1:8000/api/profile \
  -H "Authorization: Bearer $ACCESS_TOKEN" | head -c 1000
echo
echo

echo '=== TOPICS WITH TOKEN ==='
curl -sS http://127.0.0.1:8000/api/topics \
  -H "Authorization: Bearer $ACCESS_TOKEN" | head -c 1000
echo
echo

echo '=== RESUME STATUS WITH TOKEN ==='
curl -sS http://127.0.0.1:8000/api/resume/status \
  -H "Authorization: Bearer $ACCESS_TOKEN"
echo
```

期望结果：
- `/api/auth/me` 返回当前管理员用户信息
- `/api/profile` 返回 JSON，而不是 `401` 或 `500`
- `/api/topics` 返回主题列表
- `/api/resume/status` 返回当前用户自己的简历状态

说明：
- 这一步验证的是“JWT -> 当前用户恢复 -> 用户态接口放行”的完整链路。

---

## 9. 管理员接口冒烟测试

这一步验证 RBAC 的第二层，即管理员 token 可以访问 `/api/admin/*`。

```bash
echo '=== ADMIN USERS WITH TOKEN ==='
curl -sS http://127.0.0.1:8000/api/admin/users \
  -H "Authorization: Bearer $ACCESS_TOKEN" | head -c 1200
echo
echo

echo '=== ADMIN TOPIC CREATE VALIDATION ==='
curl -i -X POST http://127.0.0.1:8000/api/admin/topics \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}'
```

期望结果：
- `GET /api/admin/users` 返回用户列表
- `POST /api/admin/topics` 在空请求体下返回 `400`，而不是 `401` 或 `403`

说明：
- 第二条测试故意传无效参数，目的是验证“权限已通过，业务校验生效”。如果返回 `400`，说明当前 token 已经拥有管理员权限。

---

## 10. 前端反向代理联通性检查

前端容器通过 Nginx 把 `/api/*` 代理到 `backend:8000`。这一步验证容器间转发和浏览器入口是否通畅。

```bash
echo '=== FRONTEND INDEX ==='
curl -sS http://127.0.0.1/ | head -c 400
echo
echo

echo '=== FRONTEND PROXY AUTH ME ==='
curl -sS http://127.0.0.1/api/auth/me \
  -H "Authorization: Bearer $ACCESS_TOKEN"
echo
echo

echo '=== FRONTEND PROXY PROFILE WITHOUT TOKEN ==='
curl -i http://127.0.0.1/api/profile
```

期望结果：
- 根路径 `/` 返回前端 HTML
- 通过 `http://127.0.0.1/api/auth/me` 也能拿到当前用户信息
- 通过前端代理访问 `/api/profile` 时，未带 token 仍然返回 `401`

说明：
- 这一步验证前端部署不是“静态页面能打开就算成功”，而是“前端入口 + API 代理 + 鉴权行为”一起正常。

---

## 11. 常见失败点

### 11.1 后端容器启动失败

优先检查：
- `.env` 是否补齐了 `API_BASE`、`API_KEY`、`MODEL`
- `.env` 是否补齐了 `JWT_SECRET`、`ADMIN_PASSWORD`
- LLM 或 embedding 源是否可访问
- `data/` 目录是否可读写

收集日志：

```bash
cd /root/TechSpar
docker compose logs --tail 200 backend
```

### 11.2 登录失败

优先检查：
- `.env` 中的 `ADMIN_PASSWORD` 是否与当前数据库初始化状态一致
- 如果之前已经启动过并生成过数据库，只改 `.env` 里的密码未必会自动覆盖旧密码
- 后端日志中是否有 `Invalid username or password`
- 后端日志中是否有 `JWT_SECRET is not configured`

辅助检查：

```bash
cd /root/TechSpar
docker compose exec backend sh -lc 'ls -lah /app/data && find /app/data -maxdepth 2 -type f | sort | head -n 50'
```

### 11.3 embedding 初始化卡住或失败

这个项目最容易卡在 startup 阶段的 embedding 初始化。

常见原因：
- 服务器无法访问 HuggingFace
- 未配置 `EMBEDDING_API_BASE`
- embedding 模型首次下载耗时过长

收集日志：

```bash
cd /root/TechSpar
docker compose logs --tail 200 backend
```

### 11.4 前端容器正常但页面无法访问后端

优先检查：
- `frontend` 服务是否已 `Up`
- `backend` 服务是否已 `Up`
- `frontend/nginx.conf` 里的 `/api/` 是否正确代理到 `backend:8000`
- 浏览器入口访问的是 `http://服务器IP/`，而不是 `5173`

收集日志：

```bash
cd /root/TechSpar
docker compose logs --tail 120 frontend
docker compose logs --tail 200 backend
```

### 11.5 `passlib / bcrypt` 兼容性导致 startup 崩溃

如果后端日志里同时出现类似信号：
- `AttributeError: module 'bcrypt' has no attribute 'about'`
- `ValueError: password cannot be longer than 72 bytes`

要优先怀疑 `passlib 1.7.4` 与 `bcrypt 5.x` 的兼容性问题，而不是立刻把原因归结为 `.env` 里的 `ADMIN_PASSWORD` 太长。

原因说明：
- 当前项目使用 `passlib[bcrypt]` 处理管理员密码哈希。
- 在部分新版本 `bcrypt` 下，`passlib` 会在 backend 自检阶段触发异常。
- 这类异常可能表现成“超过 72 bytes”的误导性报错，即使 `.env` 里的管理员密码本身很短。

排查步骤：

```bash
cd /root/TechSpar

echo '=== INSTALLED VERSIONS ==='
docker compose run --rm --entrypoint python backend - <<'PY'
import importlib.metadata as md
for name in ("passlib", "bcrypt"):
    try:
        print(f"{name}={md.version(name)}")
    except Exception as exc:
        print(f"{name}=ERROR:{exc}")
PY
```

如果看到：
- `passlib=1.7.4`
- `bcrypt=5.x`

建议动作：
- 确认仓库中的 `requirements.txt` 已固定 `bcrypt==4.3.0`
- 重新构建后端镜像，不要直接复用旧层

```bash
cd /root/TechSpar

docker compose build --no-cache backend
docker compose up -d backend
docker compose logs --tail 200 backend
```

补充说明：
- 如果日志里只有 `ValueError: password cannot be longer than 72 bytes`，且你确认运行时 `ADMIN_PASSWORD` 确实是超长字符串，再回到密码本身排查。
- 如果 `ADMIN_PASSWORD` 很短，但仍伴随 `bcrypt` 版本异常日志，优先按依赖兼容性处理。

---

## 12. 停止服务

如果只是临时验证，跑完后可以停止当前 Compose 服务。

```bash
cd /root/TechSpar

docker compose down
docker compose ps
```

如果要顺带清理孤儿容器：

```bash
cd /root/TechSpar
docker compose down --remove-orphans
```

---

## 13. 回贴建议

如果需要继续远程协助，建议按下面顺序回贴结果：

1. 第 1 章“启动前检查”输出
2. 第 2 章“环境变量检查”输出
3. 第 4 章 `docker compose ps` 与 `docker compose logs --tail 200 backend`
4. 第 6 章“未登录鉴权检查”输出
5. 第 7 章“管理员登录并提取 JWT”输出
6. 第 8 章和第 9 章的带 token 冒烟测试输出

这样可以最快区分是：
- Docker 本身没起来
- 后端启动失败
- 鉴权配置缺失
- 管理员初始化异常
- 前端代理链路异常
