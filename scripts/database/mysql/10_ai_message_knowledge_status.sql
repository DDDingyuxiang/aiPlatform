-- ============================================================================
-- 10：AI 消息的知识库检索状态
-- 说明：
--   * used        检索成功且命中资料，回答可使用知识库内容
--   * empty       检索成功但没有匹配资料，不得暗示引用了内部文档
--   * unavailable 检索服务失败/超时，本次回答未使用知识库
--   * disabled    未启用知识库检索
--   * unknown     历史消息或无法判定的状态
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

USE `ai_platform`;

SET @column_exists = (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'ai_platform'
     AND TABLE_NAME = 'ai_messages'
     AND COLUMN_NAME = 'knowledge_status'
);
SET @ddl = IF(
  @column_exists = 0,
  'ALTER TABLE `ai_messages` ADD COLUMN `knowledge_status` VARCHAR(16) NULL DEFAULT NULL COMMENT ''知识库检索状态：used/empty/unavailable/disabled/unknown'' AFTER `sources_json`',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
