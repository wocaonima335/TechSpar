# TechSpar 服务器启动与冒烟测试文档

本文档用于在远程服务器上对 TechSpar 做最小部署与运行验证。

适用场景：
- 本地环境无法完整部署项目
- 需要在服务器上做后端启动、前端启动和接口冒烟测试
- 需要把测试过程沉淀为可重复执行的操作文档

执行约定：
- 以下命令默认在服务器上执行
- 当前项目目录为 `/root/TechSpar`
- 建议按章节顺序逐段执行，不要一次性整篇粘贴
- `.env` 中的真实密钥不要回贴到聊天中

---

## 1. 启动前检查

先确认仓库位置、运行时版本、磁盘和端口占用情况。

```bash
cd /root/TechSpar

echo '=== REPO ==='
pwd
git status --short --branch
git rev-parse --short HEAD

echo
echo '=== RUNTIME ==='
python3 --version || python --version
node --version
npm --version
docker --version || true

echo
echo '=== SYSTEM ==='
free -h
df -h
ss -ltnp | grep -E ':8000|:5173|:80 ' || true
```

期望结果：
- 当前目录是 `/root/TechSpar`
- Python、Node、npm 可用
- 磁盘空间和内存没有明显不足
- `8000`、`5173`、`80` 端口没有被意外占用

---

## 2. 环境变量检查

项目至少需要配置 `API_BASE`、`API_KEY`、`MODEL`。
如果不配置 `EMBEDDING_API_BASE`，后端会尝试本地加载 `BAAI/bge-m3`。

```bash
cd /root/TechSpar

[ -f .env ] || cp .env.example .env

echo '=== ENV KEYS ==='
grep -E '^(API_BASE|API_KEY|MODEL|EMBEDDING_API_BASE|EMBEDDING_API_KEY|EMBEDDING_MODEL)=' .env \
| sed 's/API_KEY=.*/API_KEY=***MASKED***/' \
| sed 's/EMBEDDING_API_KEY=.*/EMBEDDING_API_KEY=***MASKED***/'
```

如果发现以下任一项为空，需要先补齐 `.env`：
- `API_BASE=`
- `API_KEY=`
- `MODEL=`

---

## 3. 后端最小部署

### 3.1 创建虚拟环境并安装依赖

```bash
cd /root/TechSpar

mkdir -p .run-logs

python3 -m venv .venv || python -m venv .venv
source .venv/bin/activate

python -m pip install -U pip setuptools wheel
python -m pip install -r requirements.txt
```

### 3.2 启动后端

```bash
cd /root/TechSpar
source .venv/bin/activate

nohup python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 \
  > .run-logs/backend.log 2>&1 &

echo $! > .run-logs/backend.pid
sleep 10

echo '=== BACKEND LOG ==='
tail -n 120 .run-logs/backend.log
```

期望结果：
- 没有 import error
- 没有 `.env` 缺失导致的配置错误
- 没有 embedding 初始化报错
- 服务监听在 `0.0.0.0:8000`

---

## 4. 前端最小部署

当前前端开发模式会把 `/api` 代理到 `http://localhost:8000`。

### 4.1 安装前端依赖

```bash
cd /root/TechSpar/frontend

npm ci || npm install
```

### 4.2 启动前端

```bash
cd /root/TechSpar

nohup bash -lc 'cd /root/TechSpar/frontend && npm run dev -- --host 0.0.0.0 --port 5173' \
  > .run-logs/frontend.log 2>&1 &

echo $! > .run-logs/frontend.pid
sleep 10

echo '=== FRONTEND LOG ==='
tail -n 120 .run-logs/frontend.log
```

期望结果：
- Vite 成功启动
- 前端监听在 `0.0.0.0:5173`

---

## 5. 冒烟测试

先测后端，再测前端。

```bash
echo '=== API ROOT ==='
curl -sS http://127.0.0.1:8000/api/
echo
echo

echo '=== TOPICS ==='
curl -sS http://127.0.0.1:8000/api/topics | head -c 800
echo
echo

echo '=== PROFILE ==='
curl -sS http://127.0.0.1:8000/api/profile | head -c 800
echo
echo

echo '=== FRONTEND ==='
curl -I http://127.0.0.1:5173

echo
echo '=== PORTS ==='
ss -ltnp | grep -E ':8000|:5173'
```

最小成功标准：
- `GET /api/` 返回服务信息
- `GET /api/topics` 返回主题列表
- `GET /api/profile` 至少返回 JSON 结构而不是 500
- `http://127.0.0.1:5173` 返回前端响应头

---

## 6. 常见失败点

### 6.1 后端启动失败

优先检查：
- `.env` 是否配置了 `API_BASE`、`API_KEY`、`MODEL`
- 服务器是否能访问 embedding 模型来源
- `sentence-transformers`、`funasr` 是否安装成功
- Python 版本是否兼容

收集日志：

```bash
cd /root/TechSpar
tail -n 120 .run-logs/backend.log
```

### 6.2 前端启动失败

优先检查：
- `node` / `npm` 版本是否可用
- `npm ci` 是否完整执行
- `frontend.log` 中是否有 Vite、依赖安装或端口占用错误

收集日志：

```bash
cd /root/TechSpar
tail -n 120 .run-logs/frontend.log
```

### 6.3 embedding 初始化失败

这个项目最容易卡在 startup 阶段的 embedding 初始化。
因为后端启动时会预加载 embedding 模型并初始化 vector memory。

如果服务器无法访问 HuggingFace，又没有配置 `EMBEDDING_API_BASE`，常见表现是：
- 后端启动卡死
- `backend.log` 中出现模型下载失败
- `backend.log` 中出现初始化超时或异常退出

---

## 7. 停止服务

如果只是临时测试，跑完可以清理当前启动的进程。

```bash
cd /root/TechSpar

kill "$(cat .run-logs/backend.pid)" 2>/dev/null || true
kill "$(cat .run-logs/frontend.pid)" 2>/dev/null || true

ss -ltnp | grep -E ':8000|:5173' || true
```

---

## 8. 回传建议

如果需要继续远程协助，建议按下面顺序回贴结果：

1. 第 1 章“启动前检查”输出
2. 第 2 章“环境变量检查”输出
3. 如果后端失败，回贴 `tail -n 120 .run-logs/backend.log`
4. 如果前端失败，回贴 `tail -n 120 .run-logs/frontend.log`
5. 如果都启动成功，再回贴第 5 章“冒烟测试”输出

这样可以最快收敛问题，不需要重复执行无关步骤。
