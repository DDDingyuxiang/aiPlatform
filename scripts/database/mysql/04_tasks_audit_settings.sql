-- ============================================================================
-- 04：后台任务、审计与系统配置
-- 对应设计文档：scripts/illustration.md 第 3.5、3.6 节
-- 说明：
--   * audit_logs 只记录可追溯的安全/业务事件，不承载调试日志；
--   * 设置表不得保存数据库密码、模型 API Key 等部署秘密；
--   * 所有表均不定义外键。
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

USE `ai_platform`;

-- ----------------------------------------------------------------------------
-- 可追踪的后台任务（若使用专用任务队列，可由其存储取代部分字段）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `background_jobs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '任务 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `job_type` VARCHAR(64) NOT NULL COMMENT '任务类型，例如 document.parse、document.embed',
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT '状态：pending/running/succeeded/failed/canceled',
  `payload_json` JSON NULL COMMENT '任务参数（不得包含明文密钥）',
  `attempt_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '已尝试次数',
  `available_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '最早可执行时间（UTC），用于退避重试',
  `started_at` DATETIME(3) NULL DEFAULT NULL COMMENT '开始时间（UTC）',
  `finished_at` DATETIME(3) NULL DEFAULT NULL COMMENT '结束时间（UTC）',
  `error_message` TEXT NULL COMMENT '最近一次失败原因（需脱敏）',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  KEY `idx_background_jobs_status_available` (`status`, `available_at`),
  KEY `idx_background_jobs_tenant_type_status` (`tenant_id`, `job_type`, `status`),
  CONSTRAINT `chk_background_jobs_status` CHECK (`status` IN ('pending', 'running', 'succeeded', 'failed', 'canceled'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '可追踪的后台任务（幂等，可重试）';

-- ----------------------------------------------------------------------------
-- 关键操作审计（追加写入，不软删除）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '审计记录 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `actor_employee_id` BIGINT UNSIGNED NULL DEFAULT NULL COMMENT '操作人员工 ID（employees.id）；系统操作为空',
  `action` VARCHAR(128) NOT NULL COMMENT '动作标识，例如 document.delete、role.grant',
  `resource_type` VARCHAR(64) NOT NULL COMMENT '资源类型，例如 document、conversation、role',
  `resource_id` BIGINT UNSIGNED NULL DEFAULT NULL COMMENT '资源业务 ID',
  `details_json` JSON NULL COMMENT '变更详情（敏感字段需脱敏）',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '发生时间（UTC）',
  PRIMARY KEY (`id`),
  KEY `idx_audit_logs_tenant_created` (`tenant_id`, `created_at`),
  KEY `idx_audit_logs_tenant_resource` (`tenant_id`, `resource_type`, `resource_id`),
  KEY `idx_audit_logs_actor_created` (`actor_employee_id`, `created_at`),
  KEY `idx_audit_logs_tenant_action_created` (`tenant_id`, `action`, `created_at`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '关键操作审计（定义保留周期与脱敏规则）';

-- ----------------------------------------------------------------------------
-- 事务后可靠发布事件（按需，用于触发索引更新等跨系统动作）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `outbox_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '事件 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `event_type` VARCHAR(128) NOT NULL COMMENT '事件类型，例如 document.version.created',
  `aggregate_type` VARCHAR(64) NOT NULL COMMENT '聚合类型，例如 document',
  `aggregate_id` BIGINT UNSIGNED NOT NULL COMMENT '聚合根业务 ID',
  `payload_json` JSON NOT NULL COMMENT '事件载荷（不得包含明文密钥）',
  `status` VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '状态：pending/published/failed',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `published_at` DATETIME(3) NULL DEFAULT NULL COMMENT '发布成功时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  KEY `idx_outbox_events_status_created` (`status`, `created_at`),
  KEY `idx_outbox_events_tenant_aggregate` (`tenant_id`, `aggregate_type`, `aggregate_id`),
  CONSTRAINT `chk_outbox_events_status` CHECK (`status` IN ('pending', 'published', 'failed'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '事务后可靠发布事件（Outbox）';

-- ----------------------------------------------------------------------------
-- 企业级可修改配置（仅存适合放数据库的业务设置）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tenant_settings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '配置记录 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `setting_key` VARCHAR(128) NOT NULL COMMENT '配置键，例如 ui.default_language',
  `value_json` JSON NOT NULL COMMENT '配置值（JSON）',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_settings_tenant_key` (`tenant_id`, `setting_key`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '企业级可修改配置（严禁保存部署秘密）';

-- ----------------------------------------------------------------------------
-- 员工个人偏好
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `employee_settings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '配置记录 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `employee_id` BIGINT UNSIGNED NOT NULL COMMENT '员工 ID（employees.id）',
  `setting_key` VARCHAR(128) NOT NULL COMMENT '配置键，例如 ui.language、notification.email',
  `value_json` JSON NOT NULL COMMENT '配置值（JSON）',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_employee_settings_employee_key` (`employee_id`, `setting_key`),
  KEY `idx_employee_settings_tenant_employee` (`tenant_id`, `employee_id`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '员工个人偏好';

-- ----------------------------------------------------------------------------
-- 平台内部或租户 API Key（仅保存哈希或安全引用）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `api_keys` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'API Key 记录 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `name` VARCHAR(128) NOT NULL COMMENT '用途名称，便于识别与吊销',
  `key_prefix` VARCHAR(16) NOT NULL COMMENT '密钥前缀（非秘密），用于定位记录',
  `key_hash` VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '密钥哈希（如 SHA-256），严禁保存明文',
  `scopes_json` JSON NULL COMMENT '允许的权限范围',
  `status` VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT '状态：active/revoked/expired',
  `expires_at` DATETIME(3) NULL DEFAULT NULL COMMENT '过期时间（UTC）；为空表示不过期',
  `last_used_at` DATETIME(3) NULL DEFAULT NULL COMMENT '最近使用时间（UTC）',
  `created_by` BIGINT UNSIGNED NULL DEFAULT NULL COMMENT '创建人员工 ID（employees.id）',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  `revoked_at` DATETIME(3) NULL DEFAULT NULL COMMENT '吊销时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_api_keys_key_hash` (`key_hash`),
  KEY `idx_api_keys_tenant_prefix` (`tenant_id`, `key_prefix`),
  KEY `idx_api_keys_tenant_status` (`tenant_id`, `status`),
  CONSTRAINT `chk_api_keys_status` CHECK (`status` IN ('active', 'revoked', 'expired'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = 'API Key 元数据（只保存哈希与安全引用）';
