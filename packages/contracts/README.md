# @aiplatform/contracts

前后端共享的 API 契约包。使用 **TypeScript + Zod**：

- Express + TypeScript 后端：用 Zod schema 做请求/响应运行时校验；
- Vue 前端：直接复用推导出的 TypeScript 类型；
- 字段命名、可空性、枚举值只有这一份定义，避免前后端各写一套。

当前覆盖模块：

| 模块 | 内容 |
| --- | --- |
| `common` | 响应信封、ID、时间、日期、月份、分页 |
| `auth` | 登录请求/响应、当前用户资料 |
| `identity` | 部门、通讯录成员、员工 CRUD、部门 CRUD |
| `attendance` | 月度考勤、考勤记录 CRUD |

## API 约定

- API 字段使用 `camelCase`，数据库字段使用 `snake_case`。
- 对外 ID 统一为字符串；员工 ID 使用 `employees.public_id`（ULID）。
- 时间使用带时区的 ISO 8601 字符串（UTC），日期使用 `YYYY-MM-DD`，月份使用 `YYYY-MM`。
- 可空字段在契约中显式声明 `.nullable()`；首页展示用字段（`position`、`phone`、`department`）由后端将空值归一化为空字符串。
- `Employee.roles` 支持多个角色代码（包括企业自定义角色）；`UserProfile.role` 是单个系统角色（`admin` / `employee`），由后端按业务规则选取。
- 通讯录 `Member` 要求员工已有主部门；未归属部门的员工只在员工 CRUD 中出现，不进入通讯录。

## 契约与数据库字段对照

| 契约字段 | 数据库来源 |
| --- | --- |
| `id` | `employees.public_id` / `departments.id`（字符串化） |
| `username` | `employees.username`（企业内唯一） |
| `employeeId` | `employees.employee_no` |
| `name` | `employees.display_name` |
| `position` | `employees.position` |
| `phone` | `employees.phone` |
| `email` | `employees.email` |
| `departmentId` | `departments.id`（字符串化） |
| `department` | `departments.name`（经 `employee_department_memberships`） |
| `role` / `roles` | `roles.code`（经 `employee_roles`） |
| `workDate` | `attendance_records.work_date` |
| `status`（考勤） | `attendance_records.status` |
| `checkInAt` / `checkOutAt` | `attendance_records.check_in_at` / `check_out_at` |
| `source` | `attendance_records.source` |

数据库表结构变更时，必须同步修改 `scripts/database/mysql/*.sql` 与本契约。

## 使用方式

安装依赖并构建：

```bash
pnpm install
pnpm contracts:build
pnpm contracts:test
```

Express 后端示例：

```ts
import { employeeCreateSchema, type EmployeeCreate } from '@aiplatform/contracts'

const body: EmployeeCreate = employeeCreateSchema.parse(req.body)
```

Vue 前端示例：

```ts
import type { UserProfile } from '@aiplatform/contracts'

const user: UserProfile = await authApi.profile()
```

前端目前只引用类型（`import type`），不会把 Zod 打包进浏览器；如后续需要运行时校验，可直接导入对应 schema。

## 修改流程

1. 先修改本契约（字段、可空性、枚举值）；
2. 前端与 Express 后端同时按契约调整；
3. 若涉及数据库字段，同步修改 `scripts/database/mysql/*.sql` 与 `scripts/database/README.md`；
4. 执行 `pnpm contracts:build && pnpm frontend:type-check` 验证。
