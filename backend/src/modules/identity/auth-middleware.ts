import type { Request, RequestHandler } from 'express'
import { AppError, ErrorCode } from '../../http/errors.js'
import type { AuthContext, TokenVerifier } from './types.js'

const BEARER_PREFIX = 'Bearer '

/** 校验 Authorization: Bearer <JWT>，并把认证上下文写入 req.auth */
export function createAuthMiddleware(tokens: TokenVerifier): RequestHandler {
  return async (req, _res, next) => {
    const header = req.header('authorization')
    const token = header?.startsWith(BEARER_PREFIX)
      ? header.slice(BEARER_PREFIX.length).trim()
      : ''

    if (!token) {
      throw new AppError(ErrorCode.UNAUTHORIZED, '登录状态已失效', 401)
    }

    try {
      req.auth = await tokens.verify(token)
    } catch {
      throw new AppError(ErrorCode.UNAUTHORIZED, '登录状态已失效', 401)
    }

    next()
  }
}

/** 受保护路由使用：认证中间件保证 req.auth 存在 */
export function requireAuthContext(req: Request): AuthContext {
  if (!req.auth) {
    throw new AppError(ErrorCode.UNAUTHORIZED, '登录状态已失效', 401)
  }
  return req.auth
}
