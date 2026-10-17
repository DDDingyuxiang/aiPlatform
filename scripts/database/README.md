# 数据库初始化脚本

本目录依据 [`../illustration.md`](../illustration.md)（数据库设计准则）提供
aiPlatform 初始数据库结构：

```text
scripts/database/
├── mysql/                       MySQL 8.4 DDL（权威业务数据）
│   ├── 00_create_database.sql   创建 ai_platform 数据库
│   ├── 01_identity.sql          企业、组织、员工、考勤与权限
│   ├── 02_conversations.sql     私聊、群聊与消息
│   ├── 03_knowledge.sql         知识库、文档与 Embedding 任务
│   └── 04_tasks_audit_settings.sql  后台任务、审计与系统配置
└── qdrant/                      Qdrant collection 初始化（非 SQL）
    ├── README.md
    └── create_collection.sh
```

## 全局约定

- **严禁外键**：所有表只保存业务 ID，不使用 `FOREIGN KEY` / `REFERENCES`；
  关联完整性、租户边界和权限由应用服务校验。
- 主键统一为 `BIGINT UNSIGNED AUTO_INCREMENT`；对外资源另设 ULID
  `public_id`。
- 字符集 `utf8mb4`，排序规则 `utf8mb4_0900_ai_ci`，引擎 InnoDB。
- 时间统一以 UTC 存为 `DATETIME(3)`；应用层负责转换为用户时区。
- 软删除表使用 `deleted_at`；`audit_logs` 为追加写入，不做软删除。
- 所有表均使用 `CREATE TABLE IF NOT EXISTS`，脚本可重复执行，不包含
  破坏性删表语句。

## 首页个人信息映射

首页左侧个人卡片展示的资料与数据库字段对应如下：

| 首页展示项 | 数据来源 |
| --- | --- |
| 姓名 | `employees.display_name` |
| 角色 | `roles.code`（通过 `employee_roles` 关联，如 `admin` / `employee`） |
| 工号 | `employees.employee_no` |
| 职位 | `employees.position` |
| 部门 | `departments.name`（通过 `employee_department_memberships` 关联，`is_primary` 标记主部门） |
| 邮箱 | `employees.email` |
| 手机号 | `employees.phone` |
| 头像 | 前端根据 `display_name` 生成姓名首字与底色，无需存储 |
| 本月考勤 | `attendance_records.status`（按 `employee_id` + `work_date` 查询当月；打卡时间见 `check_in_at` / `check_out_at`） |

登录用户名（接口字段 `username`，首页不展示）对应 `employees.username`，企业内唯一。

## MySQL 初始化

按编号顺序执行：

```bash
mysql -h 127.0.0.1 -u <user> -p < scripts/database/mysql/00_create_database.sql

for file in scripts/database/mysql/0{1,2,3,4}_*.sql; do
  mysql -h 127.0.0.1 -u <user> -p ai_platform < "$file"
done
```

也可以直接进入 MySQL 客户端后 `SOURCE` 对应文件。

生产环境的后续结构变更应通过 Alembic 迁移管理；本目录作为初始 DDL 基线与
本地/测试环境初始化脚本，二者需保持同步。

## Qdrant 初始化

Qdrant 不使用 SQL，使用 REST API 创建 collection：

```bash
cd scripts/database/qdrant
VECTOR_SIZE=<与 embedding_profiles.dimension 一致的值> ./create_collection.sh
```

详细参数、payload 约定与注意事项见 [`qdrant/README.md`](qdrant/README.md)。

## 暂未包含的内容

按设计文档第 3.4、8 节，第一阶段不把聊天记录向量化，因此
`chat_knowledge_sources`、`chat_knowledge_items` 暂不建表，待单独设计授权、
撤回、删除同步与重新索引策略后再补充。

Redis 只承担缓存、限流、短期状态和队列职责，不作为权威业务数据源，本目录
不提供 Redis 结构脚本。

`permissions` 等基础数据的初始化（种子数据）待权限码规范确定后单独提供，
不与 DDL 混在一起。
