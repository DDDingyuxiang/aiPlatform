-- ============================================================================
-- 08：智能对话（AI 会话）持久化
-- 说明：
--   * 与员工私聊/群聊完全独立，不共用 conversations / messages；
--   * 会话按 tenant_id + employee_id 归属，所有查询必须同时带这两个条件；
--   * 摘要按版本追加，covered_message_id 是“摘要已覆盖到该消息”的边界，
--     上下文构建时只注入摘要 + 边界之后的消息，避免重复；
--   * 时间统一 UTC，DATETIME(3) 毫秒精度；软删除通过 deleted_at。
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

USE `ai_platform`;

CREATE TABLE IF NOT EXISTS `ai_conversations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'AI 会话 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `public_id` CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '对外公开 ID（ULID）',
  `employee_id` BIGINT UNSIGNED NOT NULL COMMENT '会话所有者员工 ID（employees.id）',
  `title` VARCHAR(255) NOT NULL DEFAULT '新对话' COMMENT '会话标题',
  `last_message_at` DATETIME(3) NULL DEFAULT NULL COMMENT '最后一条消息时间（UTC）',
  `last_message_preview` VARCHAR(255) NULL DEFAULT NULL COMMENT '最后一条消息预览',
  `status` VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT '状态：active/archived',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  `deleted_at` DATETIME(3) NULL DEFAULT NULL COMMENT '软删除时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ai_conversations_public_id` (`public_id`),
  KEY `idx_ai_conversations_tenant_employee` (`tenant_id`, `employee_id`, `deleted_at`, `last_message_at`),
  CONSTRAINT `chk_ai_conversations_status` CHECK (`status` IN ('active', 'archived'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '智能对话会话';

CREATE TABLE IF NOT EXISTS `ai_messages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'AI 消息 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `public_id` CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '对外公开 ID（ULID）',
  `ai_conversation_id` BIGINT UNSIGNED NOT NULL COMMENT 'AI 会话 ID（ai_conversations.id）',
  `role` VARCHAR(16) NOT NULL COMMENT '角色：user/assistant',
  `content` MEDIUMTEXT NOT NULL COMMENT '消息正文',
  `client_message_id` VARCHAR(64) NULL DEFAULT NULL COMMENT '客户端幂等 ID',
  `reply_to_message_id` BIGINT UNSIGNED NULL DEFAULT NULL COMMENT '助手消息对应的用户消息 ID',
  `model_name` VARCHAR(128) NULL DEFAULT NULL COMMENT '生成所用模型',
  `sources_json` JSON NULL COMMENT 'RAG 引用来源（JSON）',
  `status` VARCHAR(16) NOT NULL DEFAULT 'completed' COMMENT '状态：streaming/completed/failed/interrupted',
  `error_code` VARCHAR(64) NULL DEFAULT NULL COMMENT '失败错误码',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ai_messages_public_id` (`public_id`),
  UNIQUE KEY `uk_ai_messages_client` (`tenant_id`, `ai_conversation_id`, `client_message_id`),
  KEY `idx_ai_messages_conversation_id` (`ai_conversation_id`, `id`),
  KEY `idx_ai_messages_tenant_conversation_created` (`tenant_id`, `ai_conversation_id`, `created_at`),
  KEY `idx_ai_messages_reply` (`tenant_id`, `reply_to_message_id`),
  CONSTRAINT `chk_ai_messages_role` CHECK (`role` IN ('user', 'assistant')),
  CONSTRAINT `chk_ai_messages_status` CHECK (`status` IN ('streaming', 'completed', 'failed', 'interrupted'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '智能对话消息';

CREATE TABLE IF NOT EXISTS `ai_conversation_summaries` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '摘要 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `ai_conversation_id` BIGINT UNSIGNED NOT NULL COMMENT 'AI 会话 ID（ai_conversations.id）',
  `summary_no` INT UNSIGNED NOT NULL COMMENT '摘要版本号，从 1 递增',
  `summary` MEDIUMTEXT NOT NULL COMMENT '摘要内容',
  `covered_message_id` BIGINT UNSIGNED NOT NULL COMMENT '摘要已覆盖到的消息 ID（含）',
  `prompt_version` VARCHAR(32) NOT NULL DEFAULT 'v1' COMMENT '摘要提示词/策略版本',
  `model_name` VARCHAR(128) NULL DEFAULT NULL COMMENT '生成摘要所用模型',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ai_summaries_conversation_no` (`ai_conversation_id`, `summary_no`),
  KEY `idx_ai_summaries_tenant_conversation` (`tenant_id`, `ai_conversation_id`, `summary_no`),
  CONSTRAINT `chk_ai_summaries_summary_no` CHECK (`summary_no` >= 1)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '智能对话滚动摘要';
