-- ============================================================================
-- 02：私聊、群聊与消息
-- 对应设计文档：scripts/illustration.md 第 3.2 节
-- 说明：
--   * 私聊与群聊共用 conversations / messages 模型；
--   * 私聊参与者限制为两人、成员资格与消息可见范围由服务层校验；
--   * 所有表均不定义外键。
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

USE `ai_platform`;

-- ----------------------------------------------------------------------------
-- 会话主表
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `conversations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '会话 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `public_id` CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '对外公开 ID（ULID）',
  `type` VARCHAR(16) NOT NULL COMMENT '会话类型：direct/group',
  `title` VARCHAR(255) NULL DEFAULT NULL COMMENT '群聊标题；私聊可为空',
  `created_by` BIGINT UNSIGNED NOT NULL COMMENT '创建人员工 ID（employees.id）',
  `last_message_at` DATETIME(3) NULL DEFAULT NULL COMMENT '最后一条消息时间（UTC），用于会话排序',
  `status` VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT '状态：active/archived',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  `deleted_at` DATETIME(3) NULL DEFAULT NULL COMMENT '软删除时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_conversations_public_id` (`public_id`),
  KEY `idx_conversations_tenant_status_last_message` (`tenant_id`, `status`, `last_message_at`),
  KEY `idx_conversations_tenant_type` (`tenant_id`, `type`),
  CONSTRAINT `chk_conversations_type` CHECK (`type` IN ('direct', 'group')),
  CONSTRAINT `chk_conversations_status` CHECK (`status` IN ('active', 'archived'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '会话主表（私聊/群聊共用）';

-- ----------------------------------------------------------------------------
-- 会话成员
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `conversation_members` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '成员关系 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `conversation_id` BIGINT UNSIGNED NOT NULL COMMENT '会话 ID（conversations.id）',
  `employee_id` BIGINT UNSIGNED NOT NULL COMMENT '员工 ID（employees.id）',
  `member_role` VARCHAR(16) NOT NULL DEFAULT 'member' COMMENT '会话内角色：owner/admin/member',
  `joined_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '加入时间（UTC）',
  `left_at` DATETIME(3) NULL DEFAULT NULL COMMENT '退出时间（UTC）；为空表示仍在会话中',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  -- 退出后重新加入：更新原记录的 left_at/joined_at，而不是重复插入
  UNIQUE KEY `uk_conversation_members_conversation_employee` (`conversation_id`, `employee_id`),
  KEY `idx_conversation_members_employee` (`employee_id`, `conversation_id`),
  KEY `idx_conversation_members_tenant_employee` (`tenant_id`, `employee_id`),
  CONSTRAINT `chk_conversation_members_role` CHECK (`member_role` IN ('owner', 'admin', 'member'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '会话成员（记录加入、退出和角色）';

-- ----------------------------------------------------------------------------
-- 消息正文与状态
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `messages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '消息 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `conversation_id` BIGINT UNSIGNED NOT NULL COMMENT '会话 ID（conversations.id）',
  `sender_employee_id` BIGINT UNSIGNED NOT NULL COMMENT '发送人员工 ID（employees.id）',
  `message_type` VARCHAR(32) NOT NULL DEFAULT 'text' COMMENT '消息类型：text/image/file/system',
  `content` MEDIUMTEXT NULL COMMENT '消息正文；附件类消息可为空，敏感内容需按保留策略保护',
  `reply_to_message_id` BIGINT UNSIGNED NULL DEFAULT NULL COMMENT '回复的消息 ID（messages.id），不设外键',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '发送时间（UTC）',
  `edited_at` DATETIME(3) NULL DEFAULT NULL COMMENT '最近编辑时间（UTC）',
  `deleted_at` DATETIME(3) NULL DEFAULT NULL COMMENT '撤回/软删除时间（UTC）',
  PRIMARY KEY (`id`),
  KEY `idx_messages_conversation_created` (`conversation_id`, `created_at`, `id`),
  KEY `idx_messages_tenant_conversation` (`tenant_id`, `conversation_id`),
  KEY `idx_messages_tenant_sender_created` (`tenant_id`, `sender_employee_id`, `created_at`),
  CONSTRAINT `chk_messages_type` CHECK (`message_type` IN ('text', 'image', 'file', 'system'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '消息正文与状态（聊天记录不默认进入向量库）';

-- ----------------------------------------------------------------------------
-- 消息附件关联（文件本体保存在文件存储）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `message_attachments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '附件记录 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `message_id` BIGINT UNSIGNED NOT NULL COMMENT '消息 ID（messages.id）',
  `storage_key` VARCHAR(1024) NOT NULL COMMENT '文件存储对象键，不保存文件二进制',
  `file_name` VARCHAR(255) NOT NULL COMMENT '原始文件名',
  `mime_type` VARCHAR(128) NOT NULL COMMENT '服务端校验后的 MIME 类型',
  `size_bytes` BIGINT UNSIGNED NOT NULL COMMENT '文件大小（字节）',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  PRIMARY KEY (`id`),
  KEY `idx_message_attachments_message` (`message_id`),
  KEY `idx_message_attachments_tenant` (`tenant_id`, `created_at`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '消息附件关联（文件本体放文件存储）';

-- ----------------------------------------------------------------------------
-- 已送达/已读状态（按需；大群聊需评估数据量）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `message_receipts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '状态记录 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `message_id` BIGINT UNSIGNED NOT NULL COMMENT '消息 ID（messages.id）',
  `employee_id` BIGINT UNSIGNED NOT NULL COMMENT '接收人员工 ID（employees.id）',
  `delivered_at` DATETIME(3) NULL DEFAULT NULL COMMENT '送达时间（UTC）',
  `read_at` DATETIME(3) NULL DEFAULT NULL COMMENT '已读时间（UTC）',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_message_receipts_message_employee` (`message_id`, `employee_id`),
  KEY `idx_message_receipts_employee_message` (`employee_id`, `message_id`),
  KEY `idx_message_receipts_tenant` (`tenant_id`, `created_at`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '消息送达/已读状态（按需）';

-- ----------------------------------------------------------------------------
-- 会话摘要（按需；标明生成模型与摘要版本）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `conversation_summaries` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '摘要 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `conversation_id` BIGINT UNSIGNED NOT NULL COMMENT '会话 ID（conversations.id）',
  `summary` MEDIUMTEXT NOT NULL COMMENT '会话摘要内容',
  `summary_version` VARCHAR(64) NOT NULL COMMENT '摘要版本（提示词/生成策略版本）',
  `model_name` VARCHAR(128) NULL DEFAULT NULL COMMENT '生成摘要所使用的模型标识',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_conversation_summaries_conversation_version` (`conversation_id`, `summary_version`),
  KEY `idx_conversation_summaries_tenant_conversation` (`tenant_id`, `conversation_id`, `updated_at`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '会话摘要（按需）';

-- ----------------------------------------------------------------------------
-- 用户置顶会话（按需；用户级配置）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `conversation_pins` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '置顶记录 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `employee_id` BIGINT UNSIGNED NOT NULL COMMENT '员工 ID（employees.id）',
  `conversation_id` BIGINT UNSIGNED NOT NULL COMMENT '会话 ID（conversations.id）',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '置顶时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_conversation_pins_employee_conversation` (`employee_id`, `conversation_id`),
  KEY `idx_conversation_pins_tenant_employee` (`tenant_id`, `employee_id`, `created_at`),
  KEY `idx_conversation_pins_conversation` (`conversation_id`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '用户置顶会话（按需）';
