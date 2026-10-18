-- ============================================================================
-- 07：知识库文档展示元数据
-- 说明：
--   * documents 保存文档核心元数据，本表补充分类、标签、摘要与原始文件信息；
--   * 与 documents 一对一，不定义外键；租户边界由应用服务校验；
--   * 文档正文分块仍在 document_chunks，向量索引在 Qdrant。
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

USE `ai_platform`;

CREATE TABLE IF NOT EXISTS `document_metadata` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '元数据记录 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `document_id` BIGINT UNSIGNED NOT NULL COMMENT '文档 ID（documents.id）',
  `category` VARCHAR(32) NOT NULL DEFAULT 'policy' COMMENT '文档分类：policy/product/tech/market/training',
  `tags_json` JSON NULL COMMENT '标签数组（JSON）',
  `summary` TEXT NULL COMMENT '文档摘要（可由 AI 生成，展示时标注来源）',
  `file_name` VARCHAR(512) NOT NULL COMMENT '原始文件名（仅展示，不参与存储路径）',
  `file_type` VARCHAR(16) NOT NULL COMMENT '文件类型：pdf/doc/xls/ppt/img/txt',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（UTC）',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_document_metadata_document` (`document_id`),
  KEY `idx_document_metadata_tenant_category` (`tenant_id`, `category`, `updated_at`),
  CONSTRAINT `chk_document_metadata_category` CHECK (`category` IN ('policy', 'product', 'tech', 'market', 'training')),
  CONSTRAINT `chk_document_metadata_file_type` CHECK (`file_type` IN ('pdf', 'doc', 'xls', 'ppt', 'img', 'txt'))
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '知识库文档展示元数据（一对一补充 documents）';
