# aiPlatform · 企业级 AI 智能工作流平台

## 一、系统目标

- **统一工作入口**：工作台、员工消息、任务、审批、知识库、经营分析与公告集中在
  一个企业应用内。
- **AI 与业务结合**：智能对话可检索企业知识库、给出引用来源，并从聊天内容中抽取
  任务建议。
- **知识可管理**：文档支持异步索引、版本历史、回滚、失败重试与删除，检索只命中
  当前有效版本。

## 二、功能概览

| 模块     | 主要能力                                                              | 当前状态                     |
| -------- | --------------------------------------------------------------------- | ---------------------------- |
| 工作台   | 个人信息、考勤概览、任务/审批/公告/AI 洞察聚合面板                    | 页面已完成，当前使用演示数据 |
| 智能对话 | 多会话持久化、流式回答、停止生成、滚动摘要、上下文预算、知识库引用    | 已接入真实后端与 AI 服务     |
| 消息     | 私聊/群聊、未读数、附件、Redis 实时推送、聊天中自动抽取任务           | 已接入                       |
| 任务     | 任务列表、里程碑、创建与编辑、任务中心                                | 已接入                       |
| 知识库   | 上传、异步解析/向量化、进度展示、版本管理、回滚、重试、删除、语义检索 | 已接入                       |
| 员工管理 | 企业员工、部门、角色与权限管理（按权限开放）                          | 已接入                       |
| 审批中心 | 审批列表、发起审批、审批决策交互                                      | 前端原型，后端接口待接入     |
| 经营分析 | 指标概览与趋势图表                                                    | 前端原型，后端接口待接入     |
| 公告通知 | 公告列表、已读/全部已读                                               | 列表与已读接口已接入，发布管理待接入 |
| 对话总结 | 历史对话总结                                                          | 占位页面                     |

> 标记为“前端原型”的模块目前只有页面与 Mock 交互，真实后端路由尚未接入；公告模块当前只接入列表与已读操作。
> `frontend/public/app-config.json` 中的 `features.mockApi` 当前为 `false`，
> 对外演示或部署前请以“已接入真实后端”的模块为准。如需单独预览这些原型页面，
> 可将 `features.mockApi` 临时改为 `true`；此时数据来自前端 Mock，不代表真实
> 后端能力。

### 智能对话

- 会话与消息持久化到 MySQL，刷新页面后可恢复。
- 输入上下文按 token 预算组装，超出时按“最新摘要 → 历史消息”顺序裁剪；长对话
  自动生成滚动摘要，避免把所有历史一次性塞给模型。
- Ollama 调用默认关闭 thinking，并通过 SSE 把增量文本实时推送到浏览器。
- 支持停止生成；已生成内容以“已中断”状态保存。
- 知识库检索状态显式标记：`used`（已使用）、`empty`（检索成功但无匹配）、
  `unavailable`（检索服务不可用）、`disabled`（未启用）。检索失败时明确提示
  “本次回答未使用企业知识库”，不会伪装成有内部资料支持。

### 知识库与 RAG

- 支持 PDF、DOCX、XLSX、PPTX、TXT、Markdown，默认单文件不超过 10 MB。
- 上传请求只保存文件、创建 `pending` 记录并投递 Redis 队列，随后立即返回。
- 独立 `knowledge-worker` 完成解析、分块、Embedding 与 Qdrant 写入，并把
  `queued → parsing → chunking → embedding → indexing → completed` 的阶段和
  进度写入数据库。
- 前端轮询状态接口展示进度；失败时保存错误信息，可在版本历史中点击“重试”。
- 支持上传新版本、切换当前版本、下载历史版本、删除文档；检索通过
  `documents.current_version_id` 只返回当前有效版本。
- 上传时进行 SHA-256 内容去重和同名文件提示，避免同一内容被重复索引。

### 权限、租户与数据

- JWT 认证，权限从数据库实时读取，不固化在令牌中。
- 采用 RBAC：角色、权限码、员工角色关联；平台超级管理员可跨公司管理，公司管理员
  只能管理本企业。
- 所有业务查询强制带 `tenant_id`，AI 会话额外按员工隔离。
- MySQL 保存权威业务数据；Redis 用于缓存、实时事件和索引队列；Qdrant 中的向量
  是可重建索引，不替代原始文件与业务记录。

## 三、技术架构

```text
浏览器 → Nginx（静态资源 + /api + SSE）→ 业务后端 Express
                                              ├─► MySQL（权威业务数据）
                                              ├─► Redis（会话 / 缓存 / 实时事件 / 索引队列）
                                              └─► AI 服务（Python / FastAPI）

知识库 Worker ──► Redis（消费索引任务）
      ├──────────► Qdrant（向量索引）
      └──────────► AI 服务（Embedding）

AI 服务 ──► Ollama（聊天） / BGE-M3 ONNX（Embedding）
后端与 Worker 共用 MySQL、Redis、AI 服务与文件存储卷
```

| 层次     | 技术                                                                  |
| -------- | --------------------------------------------------------------------- |
| 前端     | Vue 3、TypeScript、Vite、Pinia、Vue Router、vue-i18n                  |
| 业务后端 | Node.js 24、Express 5、TypeScript、Zod、mysql2、ioredis               |
| 共享契约 | `packages/contracts`，TypeScript + Zod，前后端字段唯一来源          |
| AI 服务  | Python 3.12、FastAPI、httpx、onnxruntime、tokenizers                  |
| 模型     | Ollama 聊天模型（默认 `qwen3-local:latest`）、BGE-M3 ONNX Embedding |
| 数据     | MySQL 8.4、Redis 7、Qdrant                                            |
| 部署     | Docker Compose、Nginx                                                 |

## 四、目录结构

```text
aiPlatform/
├── frontend/               Vue 3 前端（页面、状态、HTTP、i18n）
├── backend/                Express 业务后端
│   ├── src/modules/        identity / conversations / ai / tasks / knowledge
│   ├── src/worker.ts       知识库索引 Worker 入口
│   └── config/             数据库、Redis 非秘密连接配置
├── ai-service/             Python AI 服务（聊天、摘要、Embedding）
├── packages/contracts/     前后端共享 API 契约
├── scripts/database/
│   ├── mysql/              MySQL 初始化与增量 SQL
│   └── qdrant/             Qdrant collection 初始化脚本
├── infra/                  Qdrant 等本地基础设施
├── deploy/README.md        本地 AI 与 Docker 详细启动指南
├── docker-compose.yml      完整部署编排
├── docker-compose.dev.yml  仅用于本地调试端口覆盖
└── docker-compose.ollama.yml  可选：把 Ollama 放入 Docker
```

## 五、快速启动（Docker Compose）

### 1. 前置条件

- Docker Engine 与 Docker Compose
- 宿主机 Ollama 已安装，并已准备聊天模型（默认 `qwen3-local:latest`）
- BGE-M3 ONNX 模型目录，需包含：
  - `onnx/model.onnx`
  - `onnx/model.onnx_data`
  - `onnx/tokenizer.json`

### 2. 配置环境变量

```bash
cp .env.example .env
```

至少修改：

- `MYSQL_ROOT_PASSWORD`
- `JWT_SECRET`（至少 32 字符，可用 `openssl rand -hex 32` 生成）
- `SEED_ADMIN_PASSWORD`
- `BGE_M3_MODEL_DIR`（指向宿主机上的 BGE-M3 模型目录）

如果 8080 已被占用，修改 `FRONTEND_PORT`（例如 `8081`）。

### 3. 启动 Ollama

Linux / WSL 下需让容器能够访问宿主机 Ollama：

```bash
OLLAMA_HOST=0.0.0.0:11434 ollama serve
ollama list   # 确认聊天模型存在
```

### 4. 启动全部服务

```bash
docker compose up -d --build
```

首次启动会依次完成：

1. MySQL 初始化（空数据卷时自动执行 `scripts/database/mysql/*.sql`）
2. Redis、Qdrant 启动
3. 写入演示公司、角色、管理员账号与考勤（`seed` 一次性任务）
4. 业务后端、知识库 Worker、AI 服务启动
5. Nginx 启动并对外提供前端页面

访问：

```text
http://localhost:${FRONTEND_PORT}
```

默认前端端口为 `8080`。对外发布情况：

| 服务                   | 是否暴露到宿主机 | 说明                                   |
| ---------------------- | ---------------- | -------------------------------------- |
| 前端 / Nginx           | 是               | 唯一访问入口，同时代理 `/api` 与 SSE |
| 业务后端               | 否               | 仅在 Compose 网络内，由 Nginx 转发     |
| 知识库 Worker          | 否               | 后台进程，无 HTTP 入口                 |
| AI 服务                | 否               | 仅后端与 Worker 访问                   |
| MySQL / Redis / Qdrant | 否               | 仅在 Compose 网络内                    |

演示账号：

| 账号           | 范围           |
| -------------- | -------------- |
| `admin`      | 演示企业管理员 |
| `superadmin` | 平台超级管理员 |

密码为 `.env` 中的 `SEED_ADMIN_PASSWORD`。

### 5. 可选：把 Ollama 也放进 Docker

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.ollama.yml \
  up -d --build
```

容器内模型必须来自 Ollama 官方仓库，默认拉取 `qwen3:4b`，可通过
`OLLAMA_DOCKER_MODEL` 修改。

### 6. 检查运行状态

```bash
docker compose ps
docker compose logs -f backend knowledge-worker ai-service
```

知识库上传后由 `knowledge-worker` 处理；Worker 未启动时文档会停留在“排队中”。

## 六、本地开发（不使用完整 Docker）

### 1. 前置条件

- Node.js ≥ 24.12，pnpm 12.x
- Python 3.12
- MySQL 8.4、Redis 7、Qdrant
- Ollama 与聊天模型
- BGE-M3 ONNX 模型目录

### 2. 初始化数据库

```bash
mysql -h 127.0.0.1 -u <user> -p < scripts/database/mysql/00_create_database.sql

for file in $(ls scripts/database/mysql/[0-9][0-9]_*.sql | tail -n +2); do
  mysql -h 127.0.0.1 -u <user> -p ai_platform < "$file"
done
```

已有数据库升级时，按编号补齐尚未执行的脚本；本轮知识库异步索引依赖
`10_ai_message_knowledge_status.sql` 与 `11_embedding_job_progress.sql`。

### 3. 启动 Redis 与 Qdrant

按本地安装方式启动即可。项目也提供了 Qdrant 的 Compose 配置：

```bash
docker compose -f infra/qdrant/compose.yaml up -d

cd scripts/database/qdrant
VECTOR_SIZE=1024 ./create_collection.sh
```

### 4. 启动 AI 服务

```bash
cd ai-service
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

OLLAMA_BASE_URL=http://127.0.0.1:11434 \
OLLAMA_MODEL=qwen3-local:latest \
EMBEDDING_MODEL_PATH="$HOME/models/bge-m3" \
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### 5. 配置并启动业务进程

```bash
cp backend/.env.example backend/.env
# 填写 DB_PASSWORD、JWT_SECRET、SEED_ADMIN_PASSWORD
# 确保 AI_SERVICE_URL、QDRANT_URL、Redis/MySQL 地址与本地环境一致

pnpm install
pnpm contracts:build
pnpm backend:seed
```

分别启动三个进程：

```bash
pnpm backend:dev      # HTTP API，默认 http://localhost:3000
pnpm backend:worker   # 知识库索引 Worker，消费 Redis 队列
pnpm frontend:dev     # Vite，默认 http://localhost:5173
```

前端运行时配置为 `frontend/public/app-config.json`，其中 `features.mockApi`
当前为 `false`，页面直接访问真实后端。

## 七、生产部署要点

1. **入口收敛**：默认只发布 Nginx 端口，MySQL、Redis、Qdrant、AI 服务与后端均
   只在 Compose 内部网络。生产环境建议在 Nginx 前增加 HTTPS 反向代理。
2. **密钥管理**：`.env` 不提交版本库；生产环境的 `JWT_SECRET`、数据库密码等由
   密钥管理系统注入，不要使用示例值。
3. **CORS**：将 `CORS_ORIGINS` 设置为实际访问域名。
4. **数据持久化**：MySQL、Redis、Qdrant 与 `backend_storage`（聊天附件、知识库
   原文件）均使用数据卷；需备份 MySQL 和文件存储，Qdrant 可按原文件重建。
5. **Worker 单实例**：当前队列恢复机制按单 Worker 设计。需要横向扩容时，应先
   改成带租约/owner 的队列，避免多个 Worker 同时恢复 processing 任务。
6. **资源限制**：Embedding 与聊天模型可能占用较多 CPU/内存；CPU 环境下首次加载
   模型可能达到数十秒。Compose 为 AI 服务配置了健康检查，请据此设置编排超时。
7. **上传限制**：Nginx 请求体上限 25 MB；聊天附件默认 20 MB，知识库单文件默认
   10 MB，可分别通过 `CHAT_MAX_UPLOAD_BYTES`、`KNOWLEDGE_MAX_UPLOAD_BYTES`
   调整。
8. **端口调试**：`docker-compose.dev.yml` 仅用于本机调试，会以
   `127.0.0.1` 暴露 MySQL/Redis/Qdrant，禁止用于生产：

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
   ```

更多 AI 模型、Ollama 与 Docker 的细节见 [`deploy/README.md`](deploy/README.md)。

## 八、主要配置项

| 变量                       | 说明                        | 默认值                                |
| -------------------------- | --------------------------- | ------------------------------------- |
| `FRONTEND_PORT`          | Nginx 对外端口              | `8080`                              |
| `MYSQL_ROOT_PASSWORD`    | MySQL root 密码（Compose）  | 无，必须设置                          |
| `JWT_SECRET`             | JWT 签名密钥，至少 32 字符  | 无，必须设置                          |
| `JWT_TTL_SECONDS`        | 登录令牌有效期              | `7200`                              |
| `CORS_ORIGINS`           | 允许的前端来源，逗号分隔    | `http://localhost:8080`             |
| `SEED_ADMIN_PASSWORD`    | 种子管理员密码，至少 8 位   | 无，必须设置                          |
| `OLLAMA_BASE_URL`        | Ollama 地址                 | `http://host.docker.internal:11434` |
| `OLLAMA_MODEL`           | 聊天模型名                  | `qwen3-local:latest`                |
| `OLLAMA_THINK`           | 是否保留 thinking 输出      | `false`                             |
| `OLLAMA_NUM_CTX`         | Ollama 上下文窗口           | `8192`                              |
| `OLLAMA_NUM_PREDICT`     | 单次回答最大输出 token      | `1024`                              |
| `OLLAMA_KEEP_ALIVE`      | 模型驻留时间                | `30m`                               |
| `BGE_M3_MODEL_DIR`       | 宿主机 BGE-M3 ONNX 模型目录 | `./models/bge-m3`                   |
| `EMBEDDING_MODEL_NAME`   | Embedding 模型标识          | `BAAI/bge-m3`                       |
| `QDRANT_URL`             | Qdrant 地址                 | Compose 内 `http://qdrant:6333`     |
| `QDRANT_VECTOR_SIZE`     | 向量维度，必须与模型一致    | `1024`                              |
| `KNOWLEDGE_SEARCH_LIMIT` | 知识库检索返回条数          | `6`                                 |
| `KNOWLEDGE_MIN_SCORE`    | RAG 最低相似度              | `0.4`                               |
| `AI_CONTEXT_MAX_TOKENS`  | 对话输入上下文预算          | `6000`                              |
| `AI_SUMMARY_ENABLED`     | 是否启用滚动摘要            | `true`                              |
| `AI_STREAM_TIMEOUT_MS`   | 单次流式生成总超时          | `600000`                            |

完整变量见 [`.env.example`](.env.example) 与 [`backend/.env.example`](backend/.env.example)。

## 九、数据库与迁移

- 初始化基线位于 `scripts/database/mysql/`，按编号顺序执行。
- 新环境由 Compose 在 MySQL 空数据卷时自动执行；已有环境需手动补齐增量脚本。
- 当前脚本：

| 脚本                                   | 内容                                                 |
| -------------------------------------- | ---------------------------------------------------- |
| `00_create_database.sql`             | 创建数据库                                           |
| `01`–`07`                         | 身份、会话、知识库、任务/审计/配置、审批、文档元数据 |
| `08_ai_conversations.sql`            | AI 会话、消息与滚动摘要                              |
| `09_knowledge_versioning.sql`        | 文档版本与当前版本指针                               |
| `10_ai_message_knowledge_status.sql` | AI 回答的知识库检索状态                              |
| `11_embedding_job_progress.sql`      | 索引任务阶段与进度                                   |
| `12_announcements.sql`              | 公告与员工已读状态                                   |

详细数据库约定见 [`scripts/database/README.md`](scripts/database/README.md)。

## 十、测试与质量检查

```bash
pnpm contracts:test
pnpm contracts:typecheck

pnpm backend:test
pnpm backend:typecheck

pnpm frontend:test
pnpm frontend:type-check
```

构建：

```bash
pnpm backend:build
pnpm --filter frontend build
```

## 十一、安全与可靠性约定

- 除登录与健康检查外，所有业务接口执行认证与授权；前端菜单隐藏仅影响体验。
- 数据库查询必须带租户过滤，不能信任前端传入的租户 ID。
- 模型输出视为不可信输入，结构化结果必须经过契约校验。
- 上传文件限制类型与大小，不信任客户端文件名与 MIME。
- 日志不得记录密码、令牌和完整密钥。
- 知识库检索失败必须显式标注状态，不得静默退化为普通聊天。
- 异步任务持久化状态与错误，失败可重试；Worker 启动时会恢复 processing 队列、
  重置异常退出的 running 任务，并周期扫描数据库中的 pending 任务进行补偿。

## 十二、相关文档

- [部署与本地 AI 启动指南](deploy/README.md)
- [业务后端说明](backend/README.md)
- [数据库初始化说明](scripts/database/README.md)
- [工程约定与设计原则](说明.md)
