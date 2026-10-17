/**
 * 需要权限才能注册的路由。
 *
 * 静态骨架路由见 routes.ts；本文件的路由在登录后按权限动态挂载到 'main' 下，
 * 权限撤销时移除。未授权用户直接访问会落到 404（不暴露路由存在性）。
 */
import type { RouteRecordRaw, Router } from 'vue-router'
import {
  EMPLOYEE_MANAGE_PERMISSION,
  SUPER_ADMIN_PERMISSION,
  hasAnyPermission,
} from '@/core/auth/permissions'

export const permissionRoutes: RouteRecordRaw[] = [
  {
    path: 'system/users',
    name: 'system-users',
    component: () => import('@/modules/system').then((module) => module.SystemUsersView),
    meta: {
      titleKey: 'nav.systemUsers',
      icon: 'settings',
      permissions: [SUPER_ADMIN_PERMISSION, EMPLOYEE_MANAGE_PERMISSION],
    },
  },
]

/**
 * 按当前权限同步动态路由，返回路由表是否发生变化。
 * 守卫在每次导航时调用，保证登录、刷新与权限变化后状态一致。
 */
export function syncPermissionRoutes(router: Router, permissions: readonly string[]): boolean {
  let changed = false

  for (const route of permissionRoutes) {
    if (route.name === undefined) continue

    const allowed = hasAnyPermission(permissions, route.meta?.permissions)
    const registered = router.hasRoute(route.name)

    if (allowed && !registered) {
      router.addRoute('main', route)
      changed = true
    } else if (!allowed && registered) {
      router.removeRoute(route.name)
      changed = true
    }
  }

  return changed
}
