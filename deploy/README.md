# 本地 AI 与 Docker 启动指南

## 架构

```
浏览器 → Nginx(前端静态资源 + /api 代理 + SSE)
             ↓
        业务后端 Express ──→ Redis（会话 / 缓存 / 实时事件 / 未读数）
             ↓                    ↓
           MySQL            独立 AI 服务（Python/FastAPI）
             ↓                    ↓
          Qdrant            Ollama + BGE-M3 ONNX（本地模型）
```

- 业务后端不直接调用模型，只调用 AI 服务的 `/v1/chat` 与 `/v1/embeddings`。
- 前端不接触模型地址与密钥，只调用后端 `/api/v1/ai/chat`。
- AI 服务默认连接宿主机 Ollama，也可通过覆盖文件把 Ollama 放入 Docker。
- 知识库原文与分块存 MySQL，向量索引存 Qdrant；上传后自动解析 PDF、DOCX、
  XLSX、PPTX、TXT/Markdown 并建立索引。

## 一、本地开发（不用 Docker）

前置条件：

1. 已安装 Ollama，并已拉取/创建聊天模型（本项目本地使用 `qwen3-local:latest`）。
2. BGE-M3 ONNX 模型已下载到本地目录（例如 `~/models/bge-m3`），目录中需包含
   `onnx/model.onnx`、`onnx/model.onnx_data`、`onnx/tokenizer.json`。
3. 启动 Ollama：

   ```bash
   ollama serve
   ollama list
   ```

4. 启动 Qdrant 并初始化 collection（首次执行）：

   ```bash
   docker compose -f infra/qdrant/compose.yaml up -d
   cd scripts/database/qdrant
   VECTOR_SIZE=1024 ./create_collection.sh
   ```

5. 启动 AI 服务（Python）：

   ```bash
   cd ai-service
   python3 -m venv .venv
   .venv/bin/pip install -r requirements.txt
   OLLAMA_BASE_URL=http://127.0.0.1:11434 \
   OLLAMA_MODEL=qwen3-local:latest \
   EMBEDDING_MODEL_PATH="$HOME/models/bge-m3" \
   .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
   ```

6. 启动业务后端与前端（项目根目录，另开终端）：

   ```bash
   pnpm backend:dev
   pnpm frontend:dev
   ```

   后端默认从 `AI_SERVICE_URL=http://127.0.0.1:8000` 访问 AI 服务；可在
   `backend/.env` 中覆盖。

7. 打开 `http://localhost:5173`，登录后进入「智能对话」或「知识库」。

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
# 把 BGE_M3_MODEL_DIR 改成宿主机模型目录，例如 /home/<user>/models/bge-m3

docker compose up -d --build
```

访问 `http://localhost:8080`。

启动过程：

1. MySQL 初始化（自动执行 `scripts/database/mysql/*.sql`）
2. Redis 启动
3. Qdrant 启动（后端首次检索时自动创建 collection 与 payload 索引）
4. `seed` 一次性写入演示公司、角色、管理员账号与考勤
5. 后端与 AI 服务启动
6. 前端 Nginx 启动

默认只对外发布**前端一个端口**（若 8080 已被占用，在 `.env` 中把
`FRONTEND_PORT` 改为其他端口；本机当前使用 `8081`）：

| 服务 | 是否对宿主机发布 | 说明 |
| --- | --- | --- |
| 前端 / Nginx | 是 | 唯一访问入口：`http://<host>:<FRONTEND_PORT>` |
| 后端 API | 否 | 只经 Nginx `/api` 反向代理访问 |
| AI 服务 | 否 | 只供后端访问 |
| MySQL | 否 | 仅 Compose 内部网络 |
| Redis | 否 | 仅 Compose 内部网络 |
| Qdrant | 否 | 仅 Compose 内部网络 |
| Ollama | 取决于部署方式 | 宿主机模式需本机运行 Ollama；容器模式只在 Compose 内访问 |

需要在本机用数据库客户端调试时，叠加开发覆盖文件（端口仅绑定
`127.0.0.1`，不要用于生产）：

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

不暴露端口时，查看数据库/备份可以通过容器执行：

```bash
docker compose exec mysql mysql -uroot -p ai_platform
docker compose exec redis redis-cli
```

种子账号由 `.env` 中的 `SEED_ADMIN_PASSWORD` 决定，用户名为 `admin`。

停止 / 清空数据：

```bash
docker compose down          # 保留数据卷
docker compose down -v       # 同时删除 MySQL/Redis/Qdrant/附件数据
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
- 容器 Ollama 不向宿主机发布端口，只在 Compose 网络内供 AI 服务访问。
- 模型拉取由 `ollama-init` 完成；首次启动会等待下载结束。
- 该覆盖文件同样只对外发布前端端口。
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

## 五、知识库与 RAG

1. 在「知识库」上传 PDF、DOCX、XLSX、PPTX、TXT 或 Markdown（单文件 ≤ 10MB）；
2. 后端提取文本、分块（约 350 字，60 字重叠），调用 AI 服务的
   `POST /v1/embeddings` 生成 BGE-M3 向量，并写入 Qdrant；
3. 知识库搜索会先向量化问题，再按租户过滤检索分块，返回命中原文与相似度；
4. 「智能对话」会检索相关分块注入系统提示，回答中展示「参考来源」，点击可
   打开对应文档。

相关依赖：

- MySQL 表：`knowledge_bases`、`documents`、`document_versions`、
  `document_chunks`、`document_metadata`、`embedding_*`；
  新库自动执行，已有库需手动执行 `07_knowledge_metadata.sql`。
- Qdrant collection：`document_chunks`，维度 1024（见
  `scripts/database/qdrant/create_collection.sh`）。
- 扫描版 PDF/图片需要 OCR，当前会返回明确错误而不是建立空索引。

## 配置项

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `OLLAMA_BASE_URL` | Ollama 地址（宿主机模式） | `http://host.docker.internal:11434` |
| `OLLAMA_MODEL` | 宿主机模型名 | `qwen3-local:latest` |
| `OLLAMA_TIMEOUT_SECONDS` | AI 服务调用 Ollama 超时 | `180` |
| `AI_REQUEST_TIMEOUT_MS` | 后端调用 AI 服务超时 | `180000` |
| `AI_SERVICE_URL` | 后端访问 AI 服务地址（Compose 内固定） | `http://ai-service:8000` |
| `BGE_M3_MODEL_DIR` | 宿主机 BGE-M3 ONNX 模型目录 | `./models/bge-m3` |
| `QDRANT_URL` | 后端访问 Qdrant 地址 | 宿主机 `http://127.0.0.1:6333`；Compose 内 `http://qdrant:6333` |
| `QDRANT_VECTOR_SIZE` | 向量维度，必须与模型一致 | `1024` |
| `KNOWLEDGE_MIN_SCORE` | RAG 引用的最低相似度 | `0.4` |
| `JWT_TTL_SECONDS` | 登录会话/JWT 有效期 | `7200` |
| `FRONTEND_PORT` | 前端访问端口 | `8080` |

## 安全提示

- 务必修改 `.env.example` 中的示例密码与 JWT 密钥；`.env` 不提交 Git。
- 默认部署只发布前端一个端口，AI、MySQL、Redis、Qdrant 均只在 Compose
  内部网络可达。
- 模型输出是不可信输入：后端按契约校验后才返回，前端仅以文本展示。
- 生产环境建议在宿主机防火墙只放行前端端口，为 MySQL 创建最小权限账号，
  并在 Nginx 前置反向代理启用 HTTPS。
