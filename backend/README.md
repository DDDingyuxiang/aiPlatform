# aiPlatform 后端

Express 5 + TypeScript 的业务后端，采用模块化单体结构。当前已接入
identity、conversations、tasks、ai、knowledge、workflows、analytics、announcements
模块；认证与授权中间件由各
业务模块统一复用。系统级功能、启动与部署说明见仓库根目录
[`README.md`](../README.md)。

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
│   │   └── identity/          认证、资料、目录、考勤、角色与权限
│   │       ├── index.ts       模块唯一公共入口
│   │       ├── router.ts      /api/v1/auth
│   │       ├── identity-router.ts  /api/v1/identity
│   │       ├── admin-router.ts     /api/v1/admin（需超管权限）
│   │       ├── service.ts     登录/资料/管理端业务用例
│   │       ├── repository.ts  MySQL 数据访问
│   │       ├── policies.ts    权限判定与 requirePermission 中间件
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
| `SEED_ADMIN_PASSWORD` | 企业种子账号密码；生产至少 16 位 |
| `PLATFORM_SUPERADMIN_PASSWORD` | 平台超管独立密码；生产至少 16 位且不得与企业密码相同 |

## 本地启动

```bash
# 1. 初始化数据库（在仓库根目录执行）
mysql -h 127.0.0.1 -u <user> -p < scripts/database/mysql/00_create_database.sql
for file in $(ls scripts/database/mysql/[0-9][0-9]_*.sql | tail -n +2); do
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

种子脚本可重复执行：企业、部门、角色、员工按唯一键复用，密码会被同步为环境变量当前值。
本地未配置 `PLATFORM_SUPERADMIN_PASSWORD` 时，超管兼容使用企业种子密码；生产环境要求单独设置：

| 账号 | 所属公司 | 用途 |
| --- | --- | --- |
| `admin` | `demo`（演示企业） | 公司管理员，持有 `system.employee.manage`，只能管理本企业 |
| `employee` | `demo`（演示企业） | 普通演示员工，可发起审批 |
| `superadmin` | `platform`（平台管理，虚拟公司） | 平台超级管理员，持有 `system.super_admin`，可跨公司管理 |

同时幂等创建/修复权限码 `system.employee.manage`、`system.super_admin`，
以及对应角色关联；上一版种子遗留在演示公司的 `super_admin` 角色分配会被清理。
演示企业还会补齐费用报销、请假、采购、合同四类默认审批流程，均由公司管理员角色审批；
已有启用流程不会被种子覆盖。`employee` 演示账号可发起申请，`admin` 演示账号负责审批，
`admin` 和 `employee` 使用 `SEED_ADMIN_PASSWORD`；`superadmin` 使用
`PLATFORM_SUPERADMIN_PASSWORD`。

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
| GET | `/api/v1/admin/employee-options` | 是 + 员工管理 | 可访问公司 + 所选公司的部门/职位/角色选项 |
| GET | `/api/v1/admin/users` | 是 + 员工管理 | 员工分页列表，支持公司/部门/职位/状态/关键字筛选 |
| POST | `/api/v1/admin/users` | 是 + 员工管理 | 新建员工（含初始密码、部门与角色） |
| PATCH | `/api/v1/admin/users/:id` | 是 + 员工管理 | 更新员工（用户名/工号不可改） |
| DELETE | `/api/v1/admin/users/:id` | 是 + 员工管理 | 软删除员工（禁止删除自己/平台最后一个超管） |
| GET | `/api/v1/admin/roles` | 是 + 员工管理 | 指定公司的角色、成员数、权限与权限目录 |
| GET | `/api/v1/workflows/approvals` | 是 | 当前用户发起或参与的审批单 |
| POST | `/api/v1/workflows/approvals` | 是 | 按当前启用流程发起审批 |
| POST | `/api/v1/workflows/approvals/:id/decision` | 是 | 处理当前分配给自己的审批节点 |
| GET | `/api/v1/analytics/overview?range=d30` | 是 | 当前企业审批、任务、考勤与部门人员运营概览；范围支持 `d7`、`d30`、`quarter`、`year` |

“员工管理”权限为 `system.super_admin` 或 `system.employee.manage` 任一。
受保护接口使用 `Authorization: Bearer <token>`。错误响应包含稳定错误码：
`40000` 参数不合法、`40100` 登录失效、`40101` 凭证错误、`40300` 无权限、
`40400` 不存在、`40901` 邮箱冲突、`40902` 用户名冲突、`40903` 工号冲突、
`40900` 审批冲突、`50000` 内部错误、`50300` 依赖不可用。

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

### 角色与权限

- 采用现有 RBAC 表：`roles`（租户内角色）、`permissions`（全局权限码）、
  `employee_roles`、`role_permissions`。
- `GET /auth/profile` 与登录响应中的 `UserProfile.permissions` 由角色实时
  查询得到；不把权限写入 JWT，避免权限变更后在令牌有效期内仍然生效。
- 超级管理员角色 `super_admin` 持有 `system.super_admin`。该权限码是通配权限：
  持有它即拥有全部权限，后续新增权限码无需为超管重复授权。
- 平台公司（`companies.company_code = 'platform'`）是虚拟公司：只有该公司的
  员工同时持有 `system.super_admin` 时才可跨公司查询/管理；其他公司的
  `system.super_admin` 仍只能在本企业内生效。
- 公司管理员通过 `system.employee.manage` 管理本企业员工；服务层会强制把
  `tenant_id` 固定为登录上下文中的公司，越权传入其他公司 ID 返回 `40300`。
- 授权由后端强制执行：`createRequireAnyPermission(service)` 每次请求按
  `tenant_id + employee_id` 读取权限，无权限返回 `40300`。前端隐藏菜单或路由
  只是体验优化，不构成授权。
- 员工删除为软删除：写 `deleted_at` 并置 `status='disabled'`，保留部门/角色/
  凭据与历史记录；用户名、邮箱、工号仍被唯一键占用。

## 测试

```bash
pnpm backend:typecheck
pnpm backend:test
```

当前覆盖：配置优先级与非法配置、JWT 签发/校验、登录成功与失败路径、
资料角色映射（含超管优先级）、权限读取、员工管理范围（平台跨公司/公司管理员
锁定本企业/越权 403）、员工创建与冲突映射、自删与最后超管保护、管理端角色
总览、认证/授权中间件（401/403/200）、统一信封、请求 ID、404/非法 JSON、CORS。

## 前端联调

前端已关闭 mock（`frontend/public/app-config.json` 中 `mockApi: false`），
并在 `frontend/vite.config.ts` 将 `/api` 代理到 `http://127.0.0.1:3000`。
修改 Vite 配置后需要重启前端 dev server：

```bash
pnpm frontend:dev   # 或进入 frontend 执行 pnpm dev
```

登录使用种子账号（`admin` 或 `superadmin`，密码为 `.env` 中的
`SEED_ADMIN_PASSWORD`）。`superadmin` 可跨公司管理员工，`admin` 只能管理演示
企业。当前已实现 identity、tasks、conversations、AI 对话、知识库语义检索与
RAG；公告发布、审批处理和运营分析均已接入真实后端。
公告接口支持按租户和部门范围筛选、单条标记已读、全部标记已读与发布；首次部署需执行
`scripts/database/mysql/12_announcements.sql` 和
`scripts/database/mysql/13_announcement_publish_permission.sql`。本地种子管理员需重新运行
`pnpm backend:seed` 以获得公告发布权限。

经营分析按当前租户汇总审批、任务、考勤和在职员工部门分布；近 7/30 天与前一等长
周期对比，本季度和今年以来与上一季度/上年同期对应日期对比。导出按钮会下载当前视图的 CSV 报表。
系统暂未保存销售和客户满意度等数据，因此分析页不展示这些财务指标。

## 后续方向

- 知识库文档 ACL 与增量索引
- 正式数据库迁移工具（当前以 `scripts/database/mysql` 为基线）
