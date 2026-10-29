/**
 * 系统权限码常量。
 *
 * 本文件刻意不依赖 Zod，前端可经子路径 `@aiplatform/contracts/permissions`
 * 只引用字符串常量，避免把契约包的 Zod 运行时打进浏览器。
 */

/** 超级管理员权限：持有后视为拥有全部权限（通配） */
export const SUPER_ADMIN_PERMISSION = 'system.super_admin' as const

/** 本企业员工管理权限（公司管理员使用，不跨公司） */
export const EMPLOYEE_MANAGE_PERMISSION = 'system.employee.manage' as const

/** 公告发布权限（仅允许在当前企业内发布） */
export const ANNOUNCEMENT_PUBLISH_PERMISSION = 'announcements.publish' as const

export type SystemPermission =
  | typeof SUPER_ADMIN_PERMISSION
  | typeof EMPLOYEE_MANAGE_PERMISSION
  | typeof ANNOUNCEMENT_PUBLISH_PERMISSION
