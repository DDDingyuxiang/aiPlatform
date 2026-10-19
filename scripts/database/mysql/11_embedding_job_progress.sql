-- ============================================================================
-- 11：知识库索引任务进度
-- 说明：
--   * embedding_jobs 增加 stage/progress，供前端轮询展示后台处理进度；
--   * stage：queued/parsing/chunking/embedding/indexing/completed/failed
--   * progress：0-100 的粗粒度进度
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

USE `ai_platform`;

SET @column_exists = (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'ai_platform'
     AND TABLE_NAME = 'embedding_jobs'
     AND COLUMN_NAME = 'stage'
);
SET @ddl = IF(
  @column_exists = 0,
  'ALTER TABLE `embedding_jobs` ADD COLUMN `stage` VARCHAR(32) NULL DEFAULT NULL COMMENT ''任务阶段：queued/parsing/chunking/embedding/indexing/completed/failed'' AFTER `status`',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists = (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'ai_platform'
     AND TABLE_NAME = 'embedding_jobs'
     AND COLUMN_NAME = 'progress'
);
SET @ddl = IF(
  @column_exists = 0,
  'ALTER TABLE `embedding_jobs` ADD COLUMN `progress` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT ''进度 0-100'' AFTER `stage`',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
