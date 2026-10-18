# 本地 AI 与 Docker 启动指南

## 架构

```
浏览器 → Nginx(前端静态资源 + /api 代理 + SSE)
             ↓
        业务后端 Express ──→ Redis（会话 / 缓存 / 实时事件 / 未读数）
             ↓                    ↓
           MySQL            独立 AI 服务（Python/FastAPI）
                                  ↓
                             Ollama（本地模型）
```

- 业务后端不直接调用模型，只调用 AI 服务的 `/v1/chat`。
- 前端不接触模型地址与密钥，只调用后端 `/api/v1/ai/chat`。
- AI 服务默认连接宿主机 Ollama，也可通过覆盖文件把 Ollama 放入 Docker。

## 一、本地开发（不用 Docker）

前置条件：

1. 已安装 Ollama，并已拉取/创建聊天模型（本项目本地使用 `qwen3-local:latest`）。
2. 启动 Ollama：

   ```bash
   ollama serve
   ollama list
   ```

3. 启动 AI 服务（Python）：

   ```bash
   cd ai-service
   python3 -m venv .venv
   .venv/bin/pip install -r requirements.txt
   OLLAMA_BASE_URL=http://127.0.0.1:11434 \
   OLLAMA_MODEL=qwen3-local:latest \
   .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
   ```

4. 启动业务后端与前端（项目根目录，另开终端）：

   ```bash
   pnpm backend:dev
   pnpm frontend:dev
   ```

   后端默认从 `AI_SERVICE_URL=http://127.0.0.1:8000` 访问 AI 服务；可在
   `backend/.env` 中覆盖。

5. 打开 `http://localhost:5173`，登录后进入「智能对话」。

首次请求会触发模型加载，可能需要数十秒；前后端与 AI 服务超时均设置为 180 秒。

## 二、Docker Compose（使用宿主机 Ollama）

前置条件：Docker Engine / Docker Compose 可用，宿主机 Ollama 正在运行。

Linux（WSL）下为了让容器访问宿主机 Ollama，需要让它监听所有网卡：

```bash
OLLAMA_HOST=0.0.0.0:11434 ollama serve
```

然后：

```bash
cp .env.example .env
# 修改 .env 中的 MYSQL_ROOT_PASSWORD / JWT_SECRET / SEED_ADMIN_PASSWORD

docker compose up -d --build
```

访问 `http://localhost:8080`。

启动过程：

1. MySQL 初始化（自动执行 `scripts/database/mysql/*.sql`）
2. Redis 启动
3. `seed` 一次性写入演示公司、角色、管理员账号与考勤
4. 后端与 AI 服务启动
5. 前端 Nginx 启动

默认端口（若 8080 已被占用，在 `.env` 中把 `FRONTEND_PORT` 改为其他端口，
例如本机 Windows 上的 Jetty 占用了 8080，当前本地 `.env` 使用 `8081`）：

| 服务 | 宿主端口 |
| --- | --- |
| 前端 | `8080`（可用 `FRONTEND_PORT` 覆盖） |
| MySQL | `3307` |
| Redis | `6380` |
| AI 服务 | 不对外暴露（仅后端访问） |
| Ollama | 宿主机 `11434` |

种子账号由 `.env` 中的 `SEED_ADMIN_PASSWORD` 决定，用户名为 `admin`。

停止 / 清空数据：

```bash
docker compose down          # 保留数据卷
docker compose down -v       # 同时删除 MySQL/Redis/附件数据
```

## 三、把 Ollama 也放进 Docker（可选）

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.ollama.yml \
  up -d --build
```

- `OLLAMA_DOCKER_MODEL` 必须是 Ollama 官方仓库中的模型名（默认 `qwen3:4b`），
  因为容器内的 Ollama 无法使用宿主机上自定义的 `qwen3-local:latest`。
- 容器 Ollama 默认映射到宿主机 `11435`，避免与宿主机 `11434` 冲突。
- 模型拉取由 `ollama-init` 完成；首次启动会等待下载结束。
- 需要 GPU 时取消 `docker-compose.ollama.yml` 中 `deploy.resources` 的注释。

## 四、对话中的 AI 任务

员工私聊/群聊中，如果消息出现未来时间表达（今天、明天、下周、几号、几点等），
业务后端会异步调用 AI 服务的 `POST /v1/tasks/extract`：

1. AI 结合最近 10 条对话、当前时间与参与者，判断是否需要创建任务；
2. 需要时生成标题、描述、截止时间、优先级与负责人；
3. 任务写入 `tasks` 表（来源会话/消息幂等去重）；
4. 向负责人/创建人推送 `task.created`，并在会话中插入一条 system 消息；
5. 前端任务面板实时刷新并提示，任务中心可查看完整任务。

该能力依赖 `scripts/database/mysql/06_tasks.sql`（新库会自动执行；已有库需手动执行一次）。
AI 抽取是异步增强能力：模型超时或输出不合法时，聊天本身不受影响。

## 配置项

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `OLLAMA_BASE_URL` | Ollama 地址（宿主机模式） | `http://host.docker.internal:11434` |
| `OLLAMA_MODEL` | 宿主机模型名 | `qwen3-local:latest` |
| `OLLAMA_TIMEOUT_SECONDS` | AI 服务调用 Ollama 超时 | `180` |
| `AI_REQUEST_TIMEOUT_MS` | 后端调用 AI 服务超时 | `180000` |
| `AI_SERVICE_URL` | 后端访问 AI 服务地址（Compose 内固定） | `http://ai-service:8000` |
| `JWT_TTL_SECONDS` | 登录会话/JWT 有效期 | `7200` |
| `FRONTEND_PORT` | 前端访问端口 | `8080` |

## 安全提示

- 务必修改 `.env.example` 中的示例密码与 JWT 密钥；`.env` 不提交 Git。
- AI 服务不对外暴露端口，只有业务后端可以访问。
- 模型输出是不可信输入：后端按契约校验后才返回，前端仅以文本展示。
- 生产环境建议为 MySQL 创建最小权限账号，并在反向代理层启用 HTTPS。
