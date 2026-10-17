-- ============================================================================
-- 01：企业、组织、员工、考勤与权限
-- 对应设计文档：scripts/illustration.md 第 3.1 节
-- 说明：
--   * 所有表均不定义 FOREIGN KEY / REFERENCES；
--   * tenant_id 一律由后端从登录上下文注入，不信任前端传值；
--   * 软删除表的唯一索引不包含 deleted_at，资源删除后的编号复用由应用层决定。
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

USE `ai_platform`;

-- ----------------------------------------------------------------------------
-- 企业 / 租户
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `companies` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '企业 ID，即其他表的 tenant_id',
  `public_id` CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '对外公开 ID（ULID）',
  `company_code` VARCHAR(64) NOT NULL COMMENT '企业代码，全局唯一',
  `name` VARCHAR(255) NOT NULL COMMENT '企业名称',
  `status` VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT '状态：active/suspended/disabled',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  `deleted_at` DATETIME(3) NULL DEFAULT NULL COMMENT '软删除时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_companies_public_id` (`public_id`),
  UNIQUE KEY `uk_companies_company_code` (`company_code`),
  CONSTRAINT `chk_companies_status` CHECK (`status` IN ('active', 'suspended', 'disabled'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '企业/租户';

-- ----------------------------------------------------------------------------
-- 部门
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `departments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '部门 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `parent_department_id` BIGINT UNSIGNED NULL DEFAULT NULL COMMENT '上级部门 ID（departments.id），不设外键',
  `name` VARCHAR(255) NOT NULL COMMENT '部门名称',
  `status` VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT '状态：active/disabled',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  `deleted_at` DATETIME(3) NULL DEFAULT NULL COMMENT '软删除时间（UTC）',
  PRIMARY KEY (`id`),
  KEY `idx_departments_tenant_parent` (`tenant_id`, `parent_department_id`),
  KEY `idx_departments_tenant_name` (`tenant_id`, `name`),
  CONSTRAINT `chk_departments_status` CHECK (`status` IN ('active', 'disabled'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '部门（通过 parent_department_id 组织树，应用层防环）';

-- ----------------------------------------------------------------------------
-- 员工账号与基本资料
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `employees` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '员工 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `public_id` CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '对外公开 ID（ULID）',
  `employee_no` VARCHAR(64) NOT NULL COMMENT '企业内员工编号',
  `username` VARCHAR(64) NOT NULL COMMENT '登录用户名，企业内唯一',
  `email` VARCHAR(255) NOT NULL COMMENT '企业邮箱（应用层统一小写后写入）',
  `display_name` VARCHAR(128) NOT NULL COMMENT '显示名称',
  `position` VARCHAR(128) NULL DEFAULT NULL COMMENT '职位，如数字化平台主管',
  `phone` VARCHAR(32) NULL DEFAULT NULL COMMENT '手机号（敏感信息，展示时按需脱敏）',
  `status` VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT '状态：active/disabled/locked',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  `deleted_at` DATETIME(3) NULL DEFAULT NULL COMMENT '软删除时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_employees_public_id` (`public_id`),
  UNIQUE KEY `uk_employees_tenant_no` (`tenant_id`, `employee_no`),
  UNIQUE KEY `uk_employees_tenant_username` (`tenant_id`, `username`),
  UNIQUE KEY `uk_employees_tenant_email` (`tenant_id`, `email`),
  KEY `idx_employees_tenant_status` (`tenant_id`, `status`),
  KEY `idx_employees_tenant_name` (`tenant_id`, `display_name`),
  CONSTRAINT `chk_employees_status` CHECK (`status` IN ('active', 'disabled', 'locked'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '员工账号与基本资料（不存明文密码）';

-- ----------------------------------------------------------------------------
-- 员工与部门归属关系（支持一人多部门）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `employee_department_memberships` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '归属关系 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `employee_id` BIGINT UNSIGNED NOT NULL COMMENT '员工 ID（employees.id）',
  `department_id` BIGINT UNSIGNED NOT NULL COMMENT '部门 ID（departments.id）',
  `is_primary` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否主部门；每个员工最多一个主部门，由应用层保证',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_edm_tenant_employee_department` (`tenant_id`, `employee_id`, `department_id`),
  KEY `idx_edm_tenant_department` (`tenant_id`, `department_id`, `employee_id`),
  CONSTRAINT `chk_edm_is_primary` CHECK (`is_primary` IN (0, 1))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '员工与部门的归属关系（一人多部门）';

-- ----------------------------------------------------------------------------
-- 员工每日考勤记录
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `attendance_records` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '考勤记录 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `employee_id` BIGINT UNSIGNED NOT NULL COMMENT '员工 ID（employees.id）',
  `work_date` DATE NOT NULL COMMENT '考勤归属日期，按企业时区确定',
  `status` VARCHAR(16) NOT NULL COMMENT '考勤状态：normal/late/absent',
  `check_in_at` DATETIME(3) NULL DEFAULT NULL COMMENT '上班打卡时间（UTC）',
  `check_out_at` DATETIME(3) NULL DEFAULT NULL COMMENT '下班打卡时间（UTC）',
  `source` VARCHAR(32) NOT NULL DEFAULT 'system' COMMENT '数据来源：system/device/manual/import',
  `remark` VARCHAR(255) NULL DEFAULT NULL COMMENT '备注，如迟到原因',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_attendance_records_employee_date` (`tenant_id`, `employee_id`, `work_date`),
  KEY `idx_attendance_records_tenant_date` (`tenant_id`, `work_date`),
  CONSTRAINT `chk_attendance_records_status` CHECK (`status` IN ('normal', 'late', 'absent'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '员工每日考勤记录（一人一日一条）';

-- ----------------------------------------------------------------------------
-- 角色（企业可自定义）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `roles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '角色 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `code` VARCHAR(64) NOT NULL COMMENT '角色代码，如 admin/employee（供前端与权限判断使用）',
  `name` VARCHAR(64) NOT NULL COMMENT '角色名称',
  `description` VARCHAR(255) NULL DEFAULT NULL COMMENT '角色说明',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  `deleted_at` DATETIME(3) NULL DEFAULT NULL COMMENT '软删除时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_roles_tenant_code` (`tenant_id`, `code`),
  UNIQUE KEY `uk_roles_tenant_name` (`tenant_id`, `name`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '角色（企业自定义）';

-- ----------------------------------------------------------------------------
-- 权限定义（全局统一权限码）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `permissions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '权限 ID',
  `code` VARCHAR(128) NOT NULL COMMENT '权限码，例如 knowledge.document.read',
  `description` VARCHAR(255) NULL DEFAULT NULL COMMENT '权限说明',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_permissions_code` (`code`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '权限定义（全局权限码）';

-- ----------------------------------------------------------------------------
-- 员工角色分配
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `employee_roles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '分配记录 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `employee_id` BIGINT UNSIGNED NOT NULL COMMENT '员工 ID（employees.id）',
  `role_id` BIGINT UNSIGNED NOT NULL COMMENT '角色 ID（roles.id）',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '授权时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_employee_roles_tenant_employee_role` (`tenant_id`, `employee_id`, `role_id`),
  KEY `idx_employee_roles_tenant_role` (`tenant_id`, `role_id`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '员工角色分配（不设外键）';

-- ----------------------------------------------------------------------------
-- 角色权限分配
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `role_permissions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '分配记录 ID',
  `role_id` BIGINT UNSIGNED NOT NULL COMMENT '角色 ID（roles.id）',
  `permission_id` BIGINT UNSIGNED NOT NULL COMMENT '权限 ID（permissions.id）',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '授权时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_permissions_role_permission` (`role_id`, `permission_id`),
  KEY `idx_role_permissions_permission` (`permission_id`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '角色权限分配（不设外键）';

-- ----------------------------------------------------------------------------
-- 登录凭据（可选，与员工资料分开管理）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `employee_credentials` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '凭据 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `employee_id` BIGINT UNSIGNED NOT NULL COMMENT '员工 ID（employees.id）',
  `credential_type` VARCHAR(32) NOT NULL DEFAULT 'password' COMMENT '凭据类型，如 password',
  `password_hash` VARCHAR(255) NOT NULL COMMENT '密码哈希（Argon2id/bcrypt），严禁存明文',
  `password_updated_at` DATETIME(3) NULL DEFAULT NULL COMMENT '密码最近修改时间（UTC）',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_employee_credentials_employee_type` (`employee_id`, `credential_type`),
  KEY `idx_employee_credentials_tenant_employee` (`tenant_id`, `employee_id`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '登录凭据（只保存安全哈希）';
