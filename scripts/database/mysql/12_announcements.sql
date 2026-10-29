-- ============================================================================
-- 12：公告与员工已读状态
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

USE `ai_platform`;

CREATE TABLE IF NOT EXISTS `announcements` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '公告 ID',
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `public_id` CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '对外公开 ID（ULID）',
  `title` VARCHAR(255) NOT NULL COMMENT '公告标题',
  `paragraphs` JSON NOT NULL COMMENT '正文段落数组',
  `scope` VARCHAR(16) NOT NULL COMMENT '可见范围：company/department/colleague',
  `department_id` BIGINT UNSIGNED NULL DEFAULT NULL COMMENT '部门范围公告对应部门',
  `publisher_employee_id` BIGINT UNSIGNED NOT NULL COMMENT '发布人员工 ID',
  `published_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '发布时间（UTC）',
  `pinned` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否置顶',
  `attachments` JSON NOT NULL COMMENT '附件元数据数组',
  `deleted_at` DATETIME(3) NULL DEFAULT NULL COMMENT '软删除时间（UTC）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_announcements_public_id` (`public_id`),
  KEY `idx_announcements_tenant_published` (`tenant_id`, `deleted_at`, `published_at`),
  KEY `idx_announcements_tenant_department` (`tenant_id`, `department_id`),
  CONSTRAINT `chk_announcements_scope` CHECK (`scope` IN ('company', 'department', 'colleague'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '企业公告';

CREATE TABLE IF NOT EXISTS `announcement_reads` (
  `tenant_id` BIGINT UNSIGNED NOT NULL COMMENT '企业 ID（companies.id）',
  `announcement_id` BIGINT UNSIGNED NOT NULL COMMENT '公告 ID',
  `employee_id` BIGINT UNSIGNED NOT NULL COMMENT '已读人员工 ID',
  `read_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '已读时间（UTC）',
  PRIMARY KEY (`announcement_id`, `employee_id`),
  KEY `idx_announcement_reads_tenant_employee` (`tenant_id`, `employee_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '公告员工已读状态';
