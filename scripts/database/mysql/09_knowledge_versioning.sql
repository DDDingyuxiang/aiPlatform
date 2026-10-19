-- ============================================================================
-- 09：知识库文档版本管理
-- 说明：
--   * documents.current_version_id 指向当前生效版本（document_versions.id）；
--   * document_versions.file_name 记录每个版本的原始文件名；
--   * 检索只命中当前版本，旧版本保留在 MySQL/文件存储中用于回滚；
--   * MySQL 8.4 不支持 ADD COLUMN IF NOT EXISTS，使用 information_schema
--     查询 + 动态 SQL 保证脚本可重复执行。
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

USE `ai_platform`;

-- 1. documents.current_version_id
SET @column_exists = (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'ai_platform'
     AND TABLE_NAME = 'documents'
     AND COLUMN_NAME = 'current_version_id'
);
SET @ddl = IF(
  @column_exists = 0,
  'ALTER TABLE `documents` ADD COLUMN `current_version_id` BIGINT UNSIGNED NULL DEFAULT NULL COMMENT ''当前生效版本（document_versions.id）'' AFTER `status`',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. document_versions.file_name / file_type
SET @column_exists = (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'ai_platform'
     AND TABLE_NAME = 'document_versions'
     AND COLUMN_NAME = 'file_name'
);
SET @ddl = IF(
  @column_exists = 0,
  'ALTER TABLE `document_versions` ADD COLUMN `file_name` VARCHAR(512) NULL DEFAULT NULL COMMENT ''该版本原始文件名'' AFTER `size_bytes`',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists = (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'ai_platform'
     AND TABLE_NAME = 'document_versions'
     AND COLUMN_NAME = 'file_type'
);
SET @ddl = IF(
  @column_exists = 0,
  'ALTER TABLE `document_versions` ADD COLUMN `file_type` VARCHAR(16) NULL DEFAULT NULL COMMENT ''该版本文件类型：pdf/doc/xls/ppt/img/txt'' AFTER `file_name`',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. checksum 查询索引
SET @index_exists = (
  SELECT COUNT(*)
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = 'ai_platform'
     AND TABLE_NAME = 'document_versions'
     AND INDEX_NAME = 'idx_document_versions_tenant_checksum'
);
SET @ddl = IF(
  @index_exists = 0,
  'ALTER TABLE `document_versions` ADD KEY `idx_document_versions_tenant_checksum` (`tenant_id`, `checksum`)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4. 同名文档查询索引
SET @index_exists = (
  SELECT COUNT(*)
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = 'ai_platform'
     AND TABLE_NAME = 'document_metadata'
     AND INDEX_NAME = 'idx_document_metadata_tenant_file_name'
);
SET @ddl = IF(
  @index_exists = 0,
  'ALTER TABLE `document_metadata` ADD KEY `idx_document_metadata_tenant_file_name` (`tenant_id`, `file_name`)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 5. 回填版本文件名与文件类型
UPDATE `document_versions` v
  JOIN `document_metadata` m
    ON m.tenant_id = v.tenant_id
   AND m.document_id = v.document_id
   SET v.file_name = COALESCE(v.file_name, m.file_name),
       v.file_type = COALESCE(v.file_type, m.file_type)
 WHERE v.file_name IS NULL
    OR v.file_type IS NULL;

-- 6. 回填当前版本：每个文档选择 MAX(version_no) 且 ready 的版本
UPDATE `documents` d
  JOIN (
    SELECT v.document_id, v.id AS version_id
      FROM `document_versions` v
      JOIN (
        SELECT document_id, MAX(version_no) AS max_no
          FROM `document_versions`
         WHERE status = 'ready'
         GROUP BY document_id
      ) latest
        ON latest.document_id = v.document_id
       AND latest.max_no = v.version_no
     WHERE v.status = 'ready'
  ) cur ON cur.document_id = d.id
   SET d.current_version_id = cur.version_id
 WHERE d.current_version_id IS NULL;
