import { Router, type RequestHandler } from 'express'
import {
  EMPLOYEE_MANAGE_PERMISSION,
  SUPER_ADMIN_PERMISSION,
  adminEmployeeCreateSchema,
  adminEmployeeOptionsQuerySchema,
  adminEmployeeQuerySchema,
  adminEmployeeUpdateSchema,
  adminRolesQuerySchema,
} from '@aiplatform/contracts'
import { sendSuccess } from '../../http/envelope.js'
import { requireAuthContext } from './auth-middleware.js'
import type { IdentityService } from './types.js'

export interface AdminRouterOptions {
  service: IdentityService
  requireAuth: RequestHandler
  requireAnyPermission: (permissions: readonly string[]) => RequestHandler
}

/**
 * 管理端接口：/api/v1/admin
 *
 * 平台超管（system.super_admin）可跨公司；公司管理员（system.employee.manage）
 * 只能操作本企业。具体范围由 identity service 再次判定。
 */
export function createAdminRouter(options: AdminRouterOptions): Router {
  const router = Router()
  const { service, requireAuth, requireAnyPermission } = options

  router.use(
    requireAuth,
    requireAnyPermission([SUPER_ADMIN_PERMISSION, EMPLOYEE_MANAGE_PERMISSION]),
  )

  router.get('/employee-options', async (req, res) => {
    const query = adminEmployeeOptionsQuerySchema.parse(req.query)
    const result = await service.employeeOptions(requireAuthContext(req), query.companyId)
    sendSuccess(res, result, req.requestId)
  })

  router.get('/users', async (req, res) => {
    const query = adminEmployeeQuerySchema.parse(req.query)
    const result = await service.adminUsers(requireAuthContext(req), query)
    sendSuccess(res, result, req.requestId)
  })

  router.post('/users', async (req, res) => {
    const payload = adminEmployeeCreateSchema.parse(req.body)
    const result = await service.createEmployee(requireAuthContext(req), payload)
    sendSuccess(res, result, req.requestId)
  })

  router.patch('/users/:id', async (req, res) => {
    const payload = adminEmployeeUpdateSchema.parse(req.body)
    const result = await service.updateEmployee(
      requireAuthContext(req),
      req.params.id,
      payload,
    )
    sendSuccess(res, result, req.requestId)
  })

  router.delete('/users/:id', async (req, res) => {
    const result = await service.deleteEmployee(requireAuthContext(req), req.params.id)
    sendSuccess(res, result, req.requestId)
  })

  router.get('/roles', async (req, res) => {
    const query = adminRolesQuerySchema.parse(req.query)
    const result = await service.adminRoles(requireAuthContext(req), query.companyId)
    sendSuccess(res, result, req.requestId)
  })

  return router
}
