-- ============================================================================
-- aiPlatform 数据库初始化：创建数据库
-- 目标版本：MySQL 8.4 LTS
-- 执行顺序：00 -> 01 -> 02 -> 03 -> 04
-- 约定：
--   1. 全库严禁外键，表间关系仅保存业务 ID，由应用层校验；
--   2. 时间统一使用 UTC，字段类型为 DATETIME(3)；
--   3. 表名使用小写复数蛇形命名。
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `ai_platform`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

-- 若数据库已存在但字符集不同，显式收敛默认字符集（不改变已有表）。
ALTER DATABASE `ai_platform`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;
