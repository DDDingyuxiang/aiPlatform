-- ============================================================================
-- 05：审批流程定义与审批单
-- 对应设计文档：scripts/illustration.md 第 3.4 节
-- 说明：
--   * 流程定义按版本管理，审批单引用提交时生效的定义版本，保证历史单据可追溯；
--   * 审批单表单字段按结构化行存储，不以整段 JSON 作为权威数据；
--   * 状态流转必须在事务中完成，并配合幂等键防止重复提交与重复审批；
--   * 会签/或签在实例节点层展开：同一 sequence_no 可有多行，一行对应一个审批人；
--   * 所有表均不定义外键。
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

USE `ai_platform`;

-- ----------------------------------------------------------------------------
-- 审批流程定义（按版本管理）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `workflow_definitions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '流程定义 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `public_id` CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '对外公开 ID（ULID）',
  `code` VARCHAR(64) NOT NULL COMMENT '流程代码，企业内唯一，例如 expense、leave',
  `name` VARCHAR(128) NOT NULL COMMENT '流程名称，例如 费用报销审批',
  `approval_type` VARCHAR(32) NOT NULL COMMENT '审批类型：expense/leave/purchase/contract',
  `version` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '版本号，从 1 开始递增；修改流程需新建版本',
  `description` VARCHAR(512) NULL DEFAULT NULL COMMENT '流程说明',
  `status` VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT '状态：active/disabled/archived；同一 code 仅一个 active 版本，由应用层保证',
  `created_by` BIGINT UNSIGNED NOT NULL COMMENT '创建人员工 ID（employees.id）',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  `deleted_at` DATETIME(3) NULL DEFAULT NULL COMMENT '软删除时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_workflow_definitions_public_id` (`public_id`),
  UNIQUE KEY `uk_workflow_definitions_tenant_code_version` (`tenant_id`, `code`, `version`),
  KEY `idx_workflow_definitions_tenant_type_status` (`tenant_id`, `approval_type`, `status`),
  CONSTRAINT `chk_workflow_definitions_type` CHECK (`approval_type` IN ('expense', 'leave', 'purchase', 'contract')),
  CONSTRAINT `chk_workflow_definitions_status` CHECK (`status` IN ('active', 'disabled', 'archived'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '审批流程定义（版本化）';

-- ----------------------------------------------------------------------------
-- 流程定义节点（按 sequence_no 串行流转）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `workflow_definition_nodes` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '节点定义 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `workflow_definition_id` BIGINT UNSIGNED NOT NULL COMMENT '流程定义 ID（workflow_definitions.id）',
  `node_key` VARCHAR(64) NOT NULL COMMENT '节点标识，同一流程定义内唯一',
  `node_name` VARCHAR(128) NOT NULL COMMENT '节点名称，例如 部门主管审批',
  `sequence_no` INT UNSIGNED NOT NULL COMMENT '节点顺序，从 1 开始递增',
  `approver_type` VARCHAR(32) NOT NULL DEFAULT 'employee' COMMENT '审批人类型：employee/role/department_manager',
  `approver_ref_id` BIGINT UNSIGNED NULL DEFAULT NULL COMMENT '审批人引用 ID：employee 对应 employees.id，role 对应 roles.id；department_manager 为空',
  `approval_mode` VARCHAR(16) NOT NULL DEFAULT 'any' COMMENT '审批方式：any（或签，一人通过即可）/all（会签，所有人通过）',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_workflow_definition_nodes_definition_key` (`workflow_definition_id`, `node_key`),
  UNIQUE KEY `uk_workflow_definition_nodes_definition_sequence` (`workflow_definition_id`, `sequence_no`),
  KEY `idx_workflow_definition_nodes_tenant` (`tenant_id`, `workflow_definition_id`),
  CONSTRAINT `chk_workflow_definition_nodes_approver_type` CHECK (`approver_type` IN ('employee', 'role', 'department_manager')),
  CONSTRAINT `chk_workflow_definition_nodes_approval_mode` CHECK (`approval_mode` IN ('any', 'all'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '流程定义节点（保存当前版本的节点配置）';

-- ----------------------------------------------------------------------------
-- 审批单实例（一次提交对应一条）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `approval_instances` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '审批单 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `public_id` CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '对外公开 ID（ULID）',
  `workflow_definition_id` BIGINT UNSIGNED NOT NULL COMMENT '提交时使用的流程定义版本 ID（workflow_definitions.id）',
  `approval_type` VARCHAR(32) NOT NULL COMMENT '审批类型快照：expense/leave/purchase/contract',
  `title` VARCHAR(255) NOT NULL COMMENT '审批单标题',
  `applicant_employee_id` BIGINT UNSIGNED NOT NULL COMMENT '申请人员工 ID（employees.id）',
  `applicant_department_id` BIGINT UNSIGNED NULL DEFAULT NULL COMMENT '提交时的主部门快照（departments.id）',
  `amount_cent` BIGINT UNSIGNED NULL DEFAULT NULL COMMENT '金额（分）；非金额类审批为空',
  `urgent` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否加急',
  `status` VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '状态：pending/approved/rejected',
  `current_step_sequence_no` INT UNSIGNED NULL DEFAULT NULL COMMENT '当前处理节点顺序；status=pending 时有值',
  `ai_summary_json` JSON NULL COMMENT 'AI 摘要（highlights/risk），仅供参考，不参与状态判定',
  `ai_summary_generated_at` DATETIME(3) NULL DEFAULT NULL COMMENT 'AI 摘要生成时间（UTC）',
  `submitted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '提交时间（UTC）',
  `finished_at` DATETIME(3) NULL DEFAULT NULL COMMENT '审批结束时间（UTC）',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  `deleted_at` DATETIME(3) NULL DEFAULT NULL COMMENT '软删除时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_approval_instances_public_id` (`public_id`),
  KEY `idx_approval_instances_tenant_applicant_status` (`tenant_id`, `applicant_employee_id`, `status`, `submitted_at`),
  KEY `idx_approval_instances_tenant_type_status` (`tenant_id`, `approval_type`, `status`, `submitted_at`),
  KEY `idx_approval_instances_tenant_status_submitted` (`tenant_id`, `status`, `submitted_at`),
  KEY `idx_approval_instances_tenant_definition` (`tenant_id`, `workflow_definition_id`),
  CONSTRAINT `chk_approval_instances_type` CHECK (`approval_type` IN ('expense', 'leave', 'purchase', 'contract')),
  CONSTRAINT `chk_approval_instances_status` CHECK (`status` IN ('pending', 'approved', 'rejected')),
  CONSTRAINT `chk_approval_instances_urgent` CHECK (`urgent` IN (0, 1))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '审批单实例（引用提交时的流程定义版本）';

-- ----------------------------------------------------------------------------
-- 审批节点执行记录（会签时同一顺序多行，一行一个审批人）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `approval_instance_steps` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '节点执行记录 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `approval_instance_id` BIGINT UNSIGNED NOT NULL COMMENT '审批单 ID（approval_instances.id）',
  `workflow_definition_node_id` BIGINT UNSIGNED NULL DEFAULT NULL COMMENT '来源节点 ID（workflow_definition_nodes.id）；提交节点为空',
  `node_key` VARCHAR(64) NULL DEFAULT NULL COMMENT '节点标识快照',
  `node_name` VARCHAR(128) NOT NULL COMMENT '节点名称快照，例如 提交、部门主管审批',
  `sequence_no` INT UNSIGNED NOT NULL COMMENT '节点顺序，从 1 开始；会签同一顺序可有多行',
  `approver_employee_id` BIGINT UNSIGNED NULL DEFAULT NULL COMMENT '审批人员工 ID（employees.id）；系统节点为空',
  `status` VARCHAR(16) NOT NULL DEFAULT 'waiting' COMMENT '状态：waiting/active/done/rejected/skipped',
  `action` VARCHAR(16) NULL DEFAULT NULL COMMENT '动作：submit/approve/reject；未处理为空',
  `comment` TEXT NULL COMMENT '审批意见；驳回时必填（应用层校验）',
  `acted_at` DATETIME(3) NULL DEFAULT NULL COMMENT '处理时间（UTC）',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  -- 系统节点 approver_employee_id 为空时 MySQL 允许多行，重复写入由应用层保证幂等
  UNIQUE KEY `uk_approval_instance_steps_instance_sequence_approver` (`approval_instance_id`, `sequence_no`, `approver_employee_id`),
  KEY `idx_approval_instance_steps_tenant_approver_status` (`tenant_id`, `approver_employee_id`, `status`),
  KEY `idx_approval_instance_steps_tenant_instance` (`tenant_id`, `approval_instance_id`, `sequence_no`),
  CONSTRAINT `chk_approval_instance_steps_status` CHECK (`status` IN ('waiting', 'active', 'done', 'rejected', 'skipped')),
  CONSTRAINT `chk_approval_instance_steps_action` CHECK (`action` IN ('submit', 'approve', 'reject'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '审批节点执行记录（会签/或签在此展开）';

-- ----------------------------------------------------------------------------
-- 审批单结构化表单字段
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `approval_fields` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '字段记录 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `approval_instance_id` BIGINT UNSIGNED NOT NULL COMMENT '审批单 ID（approval_instances.id）',
  `field_key` VARCHAR(128) NOT NULL COMMENT '字段键，同一审批单内唯一，例如 trip.destination',
  `field_label` VARCHAR(128) NOT NULL COMMENT '字段显示名，例如 出差地点',
  `field_value` TEXT NULL COMMENT '字段值（字段类型与内容由应用层校验，敏感内容需脱敏）',
  `sort_order` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '展示顺序',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_approval_fields_instance_key` (`approval_instance_id`, `field_key`),
  KEY `idx_approval_fields_tenant_instance` (`tenant_id`, `approval_instance_id`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '审批单结构化表单字段（权威数据按行存储）';

-- ----------------------------------------------------------------------------
-- 审批单附件（文件本体保存在文件存储）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `approval_attachments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '附件记录 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `public_id` CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '对外公开 ID（ULID）',
  `approval_instance_id` BIGINT UNSIGNED NOT NULL COMMENT '审批单 ID（approval_instances.id）',
  `uploader_employee_id` BIGINT UNSIGNED NOT NULL COMMENT '上传人员工 ID（employees.id）',
  `storage_key` VARCHAR(1024) NOT NULL COMMENT '文件存储对象键，不保存文件二进制',
  `file_name` VARCHAR(255) NOT NULL COMMENT '原始文件名',
  `mime_type` VARCHAR(128) NOT NULL COMMENT '服务端校验后的 MIME 类型',
  `size_bytes` BIGINT UNSIGNED NOT NULL COMMENT '文件大小（字节）',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '上传时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_approval_attachments_public_id` (`public_id`),
  KEY `idx_approval_attachments_tenant_instance` (`tenant_id`, `approval_instance_id`),
  KEY `idx_approval_attachments_instance` (`approval_instance_id`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '审批单附件（文件本体放文件存储）';
