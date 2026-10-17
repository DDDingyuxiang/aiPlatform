/**
 * 权限判定与授权中间件。
 *
 * 前端隐藏入口/路由只负责体验；所有受保护接口必须经过本模块校验。
 */
import type { RequestHandler } from 'express'
import { SUPER_ADMIN_PERMISSION } from '@aiplatform/contracts'
import { AppError, ErrorCode } from '../../http/errors.js'
import { requireAuthContext } from './auth-middleware.js'
import type { IdentityService } from './types.js'

/** 超级管理员权限视为通配：持有它即拥有全部权限 */
export function hasPermission(granted: readonly string[], required?: string): boolean {
  if (!required) return true
  return granted.includes(SUPER_ADMIN_PERMISSION) || granted.includes(required)
}

/**
 * 生成 requirePermission 工厂。
 *
 * 权限每次请求从数据库读取，角色/权限变更无需等待 JWT 过期；
 * 仅用于管理端等低频敏感接口，避免给所有接口增加查询成本。
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

/** 任一权限满足即可通过（例如平台超管或本企业员工管理员） */
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
