# aiPlatform 后端

Express 5 + TypeScript 的业务后端，采用模块化单体结构。当前完成
**identity 模块**（登录 / 登出 / 当前用户资料 / 通讯录 / 当月考勤），
所有业务模块后续统一复用该认证中间件。

## 目录结构

```text
backend/
├── config/
│   └── database.yaml          MySQL 连接地址（非秘密，唯一来源）
├── src/
│   ├── app.ts                 Express 应用组装（依赖注入，便于测试）
│   ├── server.ts              进程入口：加载配置、连接池、启动与优雅退出
│   ├── config/                配置加载与 Zod 校验
│   ├── http/                  信封、错误处理、请求 ID、日志
│   ├── infra/                 MySQL 连接池
│   ├── modules/
│   │   └── identity/          认证、资料、目录与考勤（逐步补齐）
│   │       ├── index.ts       模块唯一公共入口
│   │       ├── router.ts      /api/v1/auth
│   │       ├── service.ts     登录/资料业务用例
│   │       ├── repository.ts  MySQL 数据访问
│   │       ├── token.ts       JWT 签发与校验
│   │       └── password.ts    bcrypt 校验
│   ├── scripts/seed-dev.ts    本地开发种子数据
│   └── shared/logger.ts       结构化日志
├── vitest.config.ts
└── .env.example               环境变量模板（不包含真实凭证）
```

模块外部只能通过 `modules/<模块>/index.ts` 引用，不得深入模块内部文件。

## 配置

### 数据库连接

数据库连接地址**只在 [`config/database.yaml`](config/database.yaml) 中维护**：

| 字段 | 默认值 | 环境变量覆盖 |
| --- | --- | --- |
| `host` | `127.0.0.1` | `DB_HOST` |
| `port` | `3306` | `DB_PORT` |
| `database` | `ai_platform` | `DB_NAME` |
| `user` | `ai_platform` | `DB_USER` |
| `connectionLimit` | `10` | `DB_CONNECTION_LIMIT` |
| `connectTimeoutMs` | `10000` | — |

优先级：**环境变量 > `config/database.yaml` > 代码默认值**。也可用
`DB_CONFIG_PATH` 指向其他 YAML 文件。

密码**禁止写入 YAML**（严格校验会直接报错），只能通过 `DB_PASSWORD`
环境变量注入；生产环境应由密钥管理系统提供。

### 其他环境变量

复制 `.env.example` 为 `.env`（已被 Git 忽略）：

```bash
cp backend/.env.example backend/.env
```

| 变量 | 说明 |
| --- | --- |
| `NODE_ENV` | `development` / `test` / `production` |
| `PORT` | HTTP 端口，默认 `3000` |
| `DB_PASSWORD` | MySQL 密码 |
| `JWT_SECRET` | JWT 签名密钥，至少 32 字符 |
| `JWT_TTL_SECONDS` | 令牌有效期，默认 `7200` |
| `CORS_ORIGINS` | 允许的前端来源，逗号分隔 |
| `APP_TIMEZONE` | 业务时区，默认 `Asia/Shanghai`，影响“本月考勤”边界 |
| `SEED_ADMIN_PASSWORD` | 仅种子脚本使用，至少 8 位 |

## 本地启动

```bash
# 1. 初始化数据库（在仓库根目录执行）
mysql -h 127.0.0.1 -u <user> -p < scripts/database/mysql/00_create_database.sql
for file in scripts/database/mysql/0{1,2,3,4,5}_*.sql; do
  mysql -h 127.0.0.1 -u <user> -p ai_platform < "$file"
done

# 2. 配置并安装
cp backend/.env.example backend/.env   # 填写 DB_PASSWORD / JWT_SECRET
pnpm install
pnpm contracts:build

# 3. 创建演示账号（用户名 admin）
pnpm backend:seed

# 4. 启动
pnpm backend:dev          # http://localhost:3000
```

种子脚本可重复执行：企业、部门、角色、员工按唯一键复用，密码会被重置为
`SEED_ADMIN_PASSWORD` 的当前值。

## API

统一前缀 `/api/v1`，响应统一为：

```json
{ "code": 0, "data": {}, "message": "ok", "requestId": "..." }
```

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | 否 | 数据库连通性检查 |
| POST | `/api/v1/auth/login` | 否 | 用户名密码登录，返回 JWT 与用户资料 |
| POST | `/api/v1/auth/logout` | 是 | 登出（无状态，客户端清除令牌） |
| GET | `/api/v1/auth/profile` | 是 | 当前用户资料（首页个人卡片） |
| PATCH | `/api/v1/auth/profile` | 是 | 修改当前用户可自助编辑的资料（姓名/职位/邮箱/手机号） |
| GET | `/api/v1/identity/directory` | 是 | 企业部门与通讯录成员 |
| GET | `/api/v1/identity/attendance` | 是 | 当前用户在业务时区内的当月考勤 |

受保护接口使用 `Authorization: Bearer <token>`。错误响应包含稳定错误码：
`40000` 参数不合法、`40100` 登录失效、`40101` 凭证错误、`40400` 不存在、
`50000` 内部错误、`50300` 依赖不可用。

## 认证与租户说明

- JWT 使用 HS256，`sub` 为员工 `public_id`，内部 `tenant_id` / `employee_id`
  放在自定义 claim 中，不向前端暴露自增 ID。
- 登出目前为无状态实现：客户端清除令牌即可。服务端强制吊销（如 Redis
  `jti` 黑名单）在引入 Redis 后补充。
- 登录按 `username` 查找处于启用状态的企业员工。当前契约没有企业选择字段，
  若同一用户名命中多个企业会拒绝登录，待多租户登录方案确定后扩展。
- 所有业务查询必须携带 `tenant_id` 过滤；后续模块复用 `req.auth` 上下文，
  不得信任前端传入的租户 ID。
- 密码使用 bcrypt（cost 12）校验，数据库只保存哈希。

## 测试

```bash
pnpm backend:typecheck
pnpm backend:test
```

当前覆盖：配置优先级与非法配置、JWT 签发/校验、登录成功与失败路径、
资料角色映射、认证中间件、统一信封、请求 ID、404/非法 JSON、CORS。

## 前端联调

前端已关闭 mock（`frontend/public/app-config.json` 中 `mockApi: false`），
并在 `frontend/vite.config.ts` 将 `/api` 代理到 `http://127.0.0.1:3000`。
修改 Vite 配置后需要重启前端 dev server：

```bash
pnpm frontend:dev   # 或进入 frontend 执行 pnpm dev
```

登录使用种子账号（`admin` + `.env` 中的 `SEED_ADMIN_PASSWORD`）。当前只有
identity 接口已实现，任务、审批、知识库、公告等页面会暂时返回 404，后续
模块逐个补齐。

## 下一步

1. workflows：审批单列表 / 发起 / 决策（契约与表结构已就绪）
2. 其余业务模块：tasks、knowledge、announcements 等
3. Redis、限流与令牌吊销策略
4. 数据库迁移流程（当前以 `scripts/database/mysql` 为基线）
