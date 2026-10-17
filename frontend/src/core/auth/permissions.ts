/**
 * 权限判断。
 *
 * 仅用于界面引导（菜单、路由、按钮）；接口权限由后端强制校验。
 * 超级管理员权限 `system.super_admin` 视为通配：持有它即拥有全部权限。
 */
import {
  EMPLOYEE_MANAGE_PERMISSION,
  SUPER_ADMIN_PERMISSION,
} from '@aiplatform/contracts/permissions'

export { EMPLOYEE_MANAGE_PERMISSION, SUPER_ADMIN_PERMISSION }

export function hasPermission(granted: readonly string[], required?: string): boolean {
  if (!required) return true
  return granted.includes(SUPER_ADMIN_PERMISSION) || granted.includes(required)
}

/** 任一权限满足即可；未声明要求时所有登录用户可见 */
export function hasAnyPermission(
  granted: readonly string[],
  required?: readonly string[],
): boolean {
  if (!required || required.length === 0) return true
  return required.some((permission) => hasPermission(granted, permission))
}
