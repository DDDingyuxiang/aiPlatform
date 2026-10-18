import { describe, expect, it, vi } from 'vitest'
import {
  EMPLOYEE_MANAGE_PERMISSION,
  SUPER_ADMIN_PERMISSION,
} from '@aiplatform/contracts'
import { ErrorCode } from '../../../http/errors.js'
import {
  createRequireCrossTenantAccess,
  hasCrossTenantAccess,
  hasPermission,
} from '../policies.js'
import type { AuthContext, Authorization, IdentityService } from '../types.js'

const auth: AuthContext = {
  tenantId: '1',
  employeeId: '2',
  publicId: '01J00000000000000000000001',
}

describe('identity policies', () => {
  it('超级管理员是功能权限通配符，但不是跨租户资格', () => {
    expect(hasPermission([SUPER_ADMIN_PERMISSION], 'knowledge.read')).toBe(true)
    expect(hasPermission([EMPLOYEE_MANAGE_PERMISSION], 'system.super_admin')).toBe(false)

    expect(hasCrossTenantAccess([SUPER_ADMIN_PERMISSION], '100', '100')).toBe(true)
    expect(hasCrossTenantAccess([SUPER_ADMIN_PERMISSION], '1', '100')).toBe(false)
    expect(hasCrossTenantAccess([EMPLOYEE_MANAGE_PERMISSION], '100', '100')).toBe(false)
  })

  it('跨租户中间件拒绝没有平台超管资格的身份', async () => {
    const run = async (authorization: Authorization) => {
      const service = {
        authorization: vi.fn(async () => authorization),
      } as unknown as Pick<IdentityService, 'authorization'>
      const middleware = createRequireCrossTenantAccess(service)
      const req = { auth } as never
      const next = vi.fn()

      if (authorization.canManageAcrossTenants) {
        await middleware(req, {} as never, next)
        return null
      }

      try {
        await middleware(req, {} as never, next)
        return null
      } catch (error) {
        return error
      }
    }

    await expect(
      run({ permissions: [SUPER_ADMIN_PERMISSION], canManageAcrossTenants: true }),
    ).resolves.toBeNull()

    const error = await run({
      permissions: [SUPER_ADMIN_PERMISSION],
      canManageAcrossTenants: false,
    })
    expect(error).toMatchObject({ code: ErrorCode.FORBIDDEN, status: 403 })
  })
})
