-- ============================================================================
-- 06：业务任务
-- 说明：
--   * tasks 是员工可见的业务任务，区别于 background_jobs（后台作业）；
--   * source_type/source_message_id 记录 AI 从哪条聊天消息抽取任务，用于幂等去重；
--   * 所有表均不定义外键，tenant_id 由后端从登录上下文注入。
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

USE `ai_platform`;

CREATE TABLE IF NOT EXISTS `tasks` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '任务 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `public_id` CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '对外公开 ID（ULID）',
  `title` VARCHAR(255) NOT NULL COMMENT '任务标题',
  `description` TEXT NULL COMMENT '任务描述',
  `status` VARCHAR(32) NOT NULL DEFAULT 'todo' COMMENT '状态：todo/in_progress/done',
  `priority` VARCHAR(16) NOT NULL DEFAULT 'medium' COMMENT '优先级：high/medium/low',
  `due_at` DATETIME(3) NOT NULL COMMENT '截止时间（UTC）',
  `assignee_employee_id` BIGINT UNSIGNED NOT NULL COMMENT '负责人（employees.id）',
  `creator_employee_id` BIGINT UNSIGNED NOT NULL COMMENT '创建人（employees.id）',
  `progress` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '完成进度 0-100',
  `source_type` VARCHAR(32) NULL DEFAULT NULL COMMENT '来源类型，例如 chat',
  `source_conversation_id` BIGINT UNSIGNED NULL DEFAULT NULL COMMENT '来源会话 ID（conversations.id）',
  `source_message_id` BIGINT UNSIGNED NULL DEFAULT NULL COMMENT '来源消息 ID（messages.id）',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  `deleted_at` DATETIME(3) NULL DEFAULT NULL COMMENT '软删除时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tasks_public_id` (`public_id`),
  -- source_message_id 为 NULL 的手工任务不受唯一约束影响（MySQL 允许多个 NULL）
  UNIQUE KEY `uk_tasks_source` (`tenant_id`, `source_type`, `source_message_id`),
  KEY `idx_tasks_tenant_assignee_status` (`tenant_id`, `assignee_employee_id`, `status`, `due_at`),
  KEY `idx_tasks_tenant_creator` (`tenant_id`, `creator_employee_id`, `due_at`),
  KEY `idx_tasks_tenant_source_conversation` (`tenant_id`, `source_conversation_id`),
  CONSTRAINT `chk_tasks_status` CHECK (`status` IN ('todo', 'in_progress', 'done')),
  CONSTRAINT `chk_tasks_priority` CHECK (`priority` IN ('high', 'medium', 'low')),
  CONSTRAINT `chk_tasks_progress` CHECK (`progress` <= 100)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '员工业务任务（支持从对话由 AI 创建）';
