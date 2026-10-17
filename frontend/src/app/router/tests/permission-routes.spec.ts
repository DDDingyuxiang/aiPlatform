import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import {
  EMPLOYEE_MANAGE_PERMISSION,
  SUPER_ADMIN_PERMISSION,
} from '@/core/auth/permissions'
import { syncPermissionRoutes } from '@/app/router/permission-routes'

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        name: 'main',
        component: { template: '<div />' },
        children: [],
      },
    ],
  })
}

describe('permission routes', () => {
  it('按权限动态挂载与移除超管路由', () => {
    const router = createTestRouter()

    expect(router.hasRoute('system-users')).toBe(false)
    expect(syncPermissionRoutes(router, [])).toBe(false)
    expect(router.hasRoute('system-users')).toBe(false)

    expect(syncPermissionRoutes(router, [SUPER_ADMIN_PERMISSION])).toBe(true)
    expect(router.hasRoute('system-users')).toBe(true)
    expect(router.resolve('/system/users').name).toBe('system-users')

    expect(syncPermissionRoutes(router, [])).toBe(true)
    expect(router.hasRoute('system-users')).toBe(false)
  })

  it('重复同步不会重复注册，公司管理员权限也可注册', () => {
    const router = createTestRouter()

    expect(syncPermissionRoutes(router, [SUPER_ADMIN_PERMISSION])).toBe(true)
    expect(syncPermissionRoutes(router, [SUPER_ADMIN_PERMISSION])).toBe(false)

    const companyAdminRouter = createTestRouter()
    expect(syncPermissionRoutes(companyAdminRouter, [EMPLOYEE_MANAGE_PERMISSION])).toBe(true)
    expect(companyAdminRouter.hasRoute('system-users')).toBe(true)
  })
})
