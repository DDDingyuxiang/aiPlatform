/**
 * 权限判定与授权中间件。
 *
 * 前端隐藏入口/路由只负责体验；所有受保护接口必须经过本模块校验。
 *
 * 这里刻意区分两个概念：
 * 1. 功能权限（hasPermission）：是否可以使用某项功能；
 * 2. 跨租户管理资格（hasCrossTenantAccess）：是否可以操作其他公司的数据。
 *
 * system.super_admin 在功能权限上是通配的，但绝不能被当作跨租户资格使用；
 * 后者必须由服务端根据受信任的登录上下文和数据库记录判定（IdentityService.authorization）。
 */
import type { RequestHandler } from 'express'
import { SUPER_ADMIN_PERMISSION } from '@aiplatform/contracts'
import { AppError, ErrorCode } from '../../http/errors.js'
import { requireAuthContext } from './auth-middleware.js'
import type { IdentityService } from './types.js'

/** 功能权限判定：超级管理员权限作为通配，仅回答“能否使用该功能” */
export function hasPermission(granted: readonly string[], required?: string): boolean {
  if (!required) return true
  return granted.includes(SUPER_ADMIN_PERMISSION) || granted.includes(required)
}

/**
 * 跨租户管理资格判定（纯函数）。
 *
 * 两个事实必须同时成立：登录身份属于平台公司，且持有超级管理员权限。
 * tenantId / platformTenantId 必须来自受信任的登录上下文与数据库记录，
 * 调用方不得接受前端传入的租户标识。
 */
export function hasCrossTenantAccess(
  granted: readonly string[],
  tenantId: string,
  platformTenantId: string,
): boolean {
  return tenantId === platformTenantId && granted.includes(SUPER_ADMIN_PERMISSION)
}

/**
 * 生成 requirePermission 工厂。
 *
 * 权限每次请求从数据库读取，角色/权限变更无需等待 JWT 过期；
 * 仅用于管理端等低频敏感接口，避免给所有接口增加查询成本。
 *
 * 注意：这里只做功能权限校验，不授予任何跨租户能力。
 */
export function createRequirePermission(
  service: Pick<IdentityService, 'permissions'>,
): (permission: string) => RequestHandler {
  return (permission) => async (req, _res, next) => {
    const granted = await service.permissions(requireAuthContext(req))
    if (!hasPermission(granted, permission)) {
      throw new AppError(ErrorCode.FORBIDDEN, '无权访问该资源', 403)
    }
    next()
  }
}

/** 任一功能权限满足即可通过（例如平台超管或本企业员工管理员） */
export function createRequireAnyPermission(
  service: Pick<IdentityService, 'permissions'>,
): (permissions: readonly string[]) => RequestHandler {
  return (required) => async (req, _res, next) => {
    const granted = await service.permissions(requireAuthContext(req))
    if (!required.some((permission) => hasPermission(granted, permission))) {
      throw new AppError(ErrorCode.FORBIDDEN, '无权访问该资源', 403)
    }
    next()
  }
}

/**
 * 要求跨租户管理资格。
 *
 * 仅用于确实需要跨公司操作的接口；仅限本企业内管理的接口不应使用，
 * 而应在服务层通过 resolveEmployeeScope 解析租户范围。
 * 资格由 IdentityService.authorization 依据登录上下文与数据库记录判定。
 */
export function createRequireCrossTenantAccess(
  service: Pick<IdentityService, 'authorization'>,
): RequestHandler {
  return async (req, _res, next) => {
    const authorization = await service.authorization(requireAuthContext(req))
    if (!authorization.canManageAcrossTenants) {
      throw new AppError(ErrorCode.FORBIDDEN, '无权跨公司操作', 403)
    }
    next()
  }
}
