-- ============================================================================
-- 03：知识库、文档与 Embedding 任务
-- 对应设计文档：scripts/illustration.md 第 3.3 节
-- 说明：
--   * MySQL 保存原文分块、元数据与权限；Qdrant 只保存可重建的向量索引；
--   * 文档原始文件保存在文件存储，本库只保存 storage_key；
--   * 所有表均不定义外键。
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

USE `ai_platform`;

-- ----------------------------------------------------------------------------
-- 知识库
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `knowledge_bases` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '知识库 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `public_id` CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '对外公开 ID（ULID）',
  `name` VARCHAR(255) NOT NULL COMMENT '知识库名称',
  `description` TEXT NULL COMMENT '知识库说明',
  `status` VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT '状态：active/archived/disabled',
  `created_by` BIGINT UNSIGNED NOT NULL COMMENT '创建人员工 ID（employees.id）',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  `deleted_at` DATETIME(3) NULL DEFAULT NULL COMMENT '软删除时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_knowledge_bases_public_id` (`public_id`),
  KEY `idx_knowledge_bases_tenant_status` (`tenant_id`, `status`, `updated_at`),
  CONSTRAINT `chk_knowledge_bases_status` CHECK (`status` IN ('active', 'archived', 'disabled'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '知识库（企业内可有多个）';

-- ----------------------------------------------------------------------------
-- 知识库授权成员（按需；若统一 ACL 管理可合并设计）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `knowledge_base_members` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '授权记录 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `knowledge_base_id` BIGINT UNSIGNED NOT NULL COMMENT '知识库 ID（knowledge_bases.id）',
  `employee_id` BIGINT UNSIGNED NOT NULL COMMENT '员工 ID（employees.id）',
  `access_level` VARCHAR(16) NOT NULL DEFAULT 'read' COMMENT '访问级别：read/write/admin',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_knowledge_base_members_kb_employee` (`knowledge_base_id`, `employee_id`),
  KEY `idx_knowledge_base_members_employee` (`employee_id`, `knowledge_base_id`),
  CONSTRAINT `chk_knowledge_base_members_access` CHECK (`access_level` IN ('read', 'write', 'admin'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '知识库授权成员（按需）';

-- ----------------------------------------------------------------------------
-- 文档逻辑实体（保存元数据，不保存大型文件本体）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `documents` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '文档 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `public_id` CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '对外公开 ID（ULID）',
  `knowledge_base_id` BIGINT UNSIGNED NOT NULL COMMENT '知识库 ID（knowledge_bases.id）',
  `title` VARCHAR(512) NOT NULL COMMENT '文档标题',
  `source_type` VARCHAR(32) NOT NULL DEFAULT 'upload' COMMENT '来源类型：upload/url/api',
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT '状态：pending/processing/ready/failed/archived',
  `created_by` BIGINT UNSIGNED NOT NULL COMMENT '上传/创建人员工 ID（employees.id）',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  `deleted_at` DATETIME(3) NULL DEFAULT NULL COMMENT '软删除时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_documents_public_id` (`public_id`),
  KEY `idx_documents_tenant_kb_status` (`tenant_id`, `knowledge_base_id`, `status`, `updated_at`),
  KEY `idx_documents_tenant_created_by` (`tenant_id`, `created_by`),
  CONSTRAINT `chk_documents_source_type` CHECK (`source_type` IN ('upload', 'url', 'api')),
  CONSTRAINT `chk_documents_status` CHECK (`status` IN ('pending', 'processing', 'ready', 'failed', 'archived'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '文档逻辑实体（元数据）';

-- ----------------------------------------------------------------------------
-- 文档版本（便于重新解析、回滚和追踪）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `document_versions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '文档版本 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `document_id` BIGINT UNSIGNED NOT NULL COMMENT '文档 ID（documents.id）',
  `version_no` INT UNSIGNED NOT NULL COMMENT '版本号，从 1 开始递增',
  `storage_key` VARCHAR(1024) NOT NULL COMMENT '文件存储对象键，不保存文件二进制',
  `checksum` VARCHAR(128) NOT NULL COMMENT '文件内容校验和，用于去重与完整性校验',
  `mime_type` VARCHAR(128) NOT NULL COMMENT '服务端校验后的 MIME 类型',
  `size_bytes` BIGINT UNSIGNED NOT NULL COMMENT '文件大小（字节）',
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT '状态：pending/processing/ready/failed',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_document_versions_document_version` (`document_id`, `version_no`),
  KEY `idx_document_versions_tenant_document` (`tenant_id`, `document_id`, `created_at`),
  CONSTRAINT `chk_document_versions_status` CHECK (`status` IN ('pending', 'processing', 'ready', 'failed'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '文档版本（原始文件在文件存储）';

-- ----------------------------------------------------------------------------
-- 文档分块文本（Qdrant 只存必要引用与过滤字段）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `document_chunks` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '分块 ID，也是 Qdrant payload 中的 chunk_id',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `document_id` BIGINT UNSIGNED NOT NULL COMMENT '文档 ID（documents.id）',
  `document_version_id` BIGINT UNSIGNED NOT NULL COMMENT '文档版本 ID（document_versions.id）',
  `chunk_index` INT UNSIGNED NOT NULL COMMENT '版本内分块序号，从 0 开始',
  `content` MEDIUMTEXT NOT NULL COMMENT '分块原文，可能包含敏感信息',
  `token_count` INT UNSIGNED NULL DEFAULT NULL COMMENT '分块 token 数',
  `metadata_json` JSON NULL COMMENT '分块元数据，如页码、标题层级、解析器信息',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_document_chunks_version_chunk` (`document_version_id`, `chunk_index`),
  KEY `idx_document_chunks_tenant_document` (`tenant_id`, `document_id`, `document_version_id`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '文档分块文本（Qdrant 仅存向量与检索过滤字段）';

-- ----------------------------------------------------------------------------
-- 文档访问控制
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `document_acl` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'ACL 记录 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `document_id` BIGINT UNSIGNED NOT NULL COMMENT '文档 ID（documents.id）',
  `subject_type` VARCHAR(16) NOT NULL COMMENT '授权主体类型：employee/department/role',
  `subject_id` BIGINT UNSIGNED NOT NULL COMMENT '授权主体 ID，按 subject_type 解释',
  `permission` VARCHAR(16) NOT NULL DEFAULT 'read' COMMENT '权限：read/write/manage',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_document_acl_document_subject` (`document_id`, `subject_type`, `subject_id`),
  KEY `idx_document_acl_tenant_subject` (`tenant_id`, `subject_type`, `subject_id`),
  CONSTRAINT `chk_document_acl_subject_type` CHECK (`subject_type` IN ('employee', 'department', 'role')),
  CONSTRAINT `chk_document_acl_permission` CHECK (`permission` IN ('read', 'write', 'manage'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '文档访问控制（检索时由后端重新校验，不能只依赖 Qdrant payload）';

-- ----------------------------------------------------------------------------
-- Embedding 配置登记（全局）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `embedding_profiles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Embedding 配置 ID',
  `provider` VARCHAR(64) NOT NULL COMMENT '模型供应商标识',
  `model_name` VARCHAR(128) NOT NULL COMMENT 'Embedding 模型名称',
  `dimension` SMALLINT UNSIGNED NOT NULL COMMENT '向量维度，必须与模型实际输出一致',
  `distance_metric` VARCHAR(16) NOT NULL DEFAULT 'cosine' COMMENT '距离度量：cosine/dot/euclidean',
  `version` VARCHAR(64) NOT NULL DEFAULT 'v1' COMMENT '配置版本；模型或维度变化时应新建版本/collection',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_embedding_profiles_provider_model_version` (`provider`, `model_name`, `version`),
  CONSTRAINT `chk_embedding_profiles_dimension` CHECK (`dimension` > 0),
  CONSTRAINT `chk_embedding_profiles_distance` CHECK (`distance_metric` IN ('cosine', 'dot', 'euclidean'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = 'Embedding 配置登记（记录模型与维度）';

-- ----------------------------------------------------------------------------
-- 解析/向量化任务（支持失败重试与任务追踪）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `embedding_jobs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '任务 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `document_id` BIGINT UNSIGNED NOT NULL COMMENT '文档 ID（documents.id）',
  `document_version_id` BIGINT UNSIGNED NOT NULL COMMENT '文档版本 ID（document_versions.id）',
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT '状态：pending/running/succeeded/failed/canceled',
  `attempt_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '已尝试次数',
  `error_message` TEXT NULL COMMENT '最近一次失败原因（需脱敏）',
  `started_at` DATETIME(3) NULL DEFAULT NULL COMMENT '开始时间（UTC）',
  `finished_at` DATETIME(3) NULL DEFAULT NULL COMMENT '结束时间（UTC）',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  KEY `idx_embedding_jobs_tenant_document` (`tenant_id`, `document_id`, `status`),
  KEY `idx_embedding_jobs_status_created` (`status`, `created_at`),
  CONSTRAINT `chk_embedding_jobs_status` CHECK (`status` IN ('pending', 'running', 'succeeded', 'failed', 'canceled'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '文档解析/向量化任务（幂等，可重试）';

-- ----------------------------------------------------------------------------
-- 向量记录映射（MySQL 与 Qdrant 的对照表，不保存向量数组）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `embedding_records` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '映射记录 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `chunk_id` BIGINT UNSIGNED NOT NULL COMMENT '分块 ID（document_chunks.id）',
  `vector_store` VARCHAR(32) NOT NULL DEFAULT 'qdrant' COMMENT '向量存储类型',
  `collection_name` VARCHAR(128) NOT NULL COMMENT 'Qdrant collection 名称',
  `point_id` VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'Qdrant point ID（UUID 或数值字符串）',
  `embedding_profile_id` BIGINT UNSIGNED NOT NULL COMMENT 'Embedding 配置 ID（embedding_profiles.id）',
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT '状态：pending/indexed/failed/deleted',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_embedding_records_store_collection_point` (`vector_store`, `collection_name`, `point_id`),
  KEY `idx_embedding_records_tenant_chunk` (`tenant_id`, `chunk_id`),
  KEY `idx_embedding_records_profile` (`embedding_profile_id`),
  CONSTRAINT `chk_embedding_records_status` CHECK (`status` IN ('pending', 'indexed', 'failed', 'deleted'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '向量记录映射（保存 MySQL 与 Qdrant 的对应关系，不保存向量数组）';
