import { Router, type RequestHandler } from 'express'
import {
  EMPLOYEE_MANAGE_PERMISSION,
  SUPER_ADMIN_PERMISSION,
  adminEmployeeCreateSchema,
  adminEmployeeOptionsQuerySchema,
  adminEmployeeQuerySchema,
  adminEmployeeUpdateSchema,
  adminRolesQuerySchema,
  adminRolePermissionsUpdateSchema,
  roleCodeSchema,
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
 * 本路由的中间件只校验功能权限（能否使用员工管理功能），不代表可以跨公司。
 * 实际租户范围由 identity service 的 resolveEmployeeScope 根据可信登录上下文
 * 与数据库记录逐请求判定：只有平台公司的超级管理员具备跨租户资格。
 * 新增管理端接口必须继续经过该作用域解析，不能仅凭 system.super_admin
 * 通配权限直接操作其他租户数据。
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

  router.patch('/roles/:code/permissions', async (req, res) => {
    const query = adminRolesQuerySchema.parse(req.query)
    const payload = adminRolePermissionsUpdateSchema.parse(req.body)
    const result = await service.updateAdminRolePermissions(
      requireAuthContext(req),
      roleCodeSchema.parse(req.params.code),
      payload.permissions,
      query.companyId,
    )
    sendSuccess(res, result, req.requestId)
  })

  return router
}
