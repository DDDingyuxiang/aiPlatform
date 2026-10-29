-- ============================================================================
-- 13：公告发布权限
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

USE `ai_platform`;

INSERT IGNORE INTO `permissions` (`code`, `description`)
VALUES ('announcements.publish', '本企业公告发布（不跨公司）');
