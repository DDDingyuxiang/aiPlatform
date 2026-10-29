import type { Request, RequestHandler } from 'express'
import { AppError, ErrorCode } from '../../http/errors.js'
import type { AuthContext, SessionStore, TokenVerifier } from './types.js'

const BEARER_PREFIX = 'Bearer '

/**
 * 校验 Authorization: Bearer <JWT>、Redis 会话及 MySQL 中的账号状态。
 *
 * 已撤销会话或已停用/删除员工的令牌会返回 401；
 * Redis 不可用时返回 503，避免在校验能力失效时继续放行。
 */
export function createAuthMiddleware(
  tokens: TokenVerifier,
  sessions: SessionStore,
  validatePrincipal?: (context: AuthContext) => Promise<boolean>,
  afterAuth?: RequestHandler,
): RequestHandler {
  return async (req, res, next) => {
    const header = req.header('authorization')
    const token = header?.startsWith(BEARER_PREFIX)
      ? header.slice(BEARER_PREFIX.length).trim()
      : ''

    if (!token) {
      throw new AppError(ErrorCode.UNAUTHORIZED, '登录状态已失效', 401)
    }

    let context: AuthContext
    try {
      context = await tokens.verify(token)
    } catch {
      throw new AppError(ErrorCode.UNAUTHORIZED, '登录状态已失效', 401)
    }

    if (!context.sessionId) {
      throw new AppError(ErrorCode.UNAUTHORIZED, '登录状态已失效', 401)
    }

    let active: boolean
    try {
      active = await sessions.exists(context.sessionId)
    } catch (error) {
      throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, '登录状态服务不可用', 503, {
        cause: error,
      })
    }

    if (!active) {
      throw new AppError(ErrorCode.UNAUTHORIZED, '登录状态已失效', 401)
    }

    if (validatePrincipal) {
      let principalActive: boolean
      try {
        principalActive = await validatePrincipal(context)
      } catch (error) {
        throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, '账号状态服务不可用', 503, {
          cause: error,
        })
      }
      if (!principalActive) {
        throw new AppError(ErrorCode.UNAUTHORIZED, '账号已停用或不存在', 401)
      }
    }

    req.auth = context
    if (afterAuth) return afterAuth(req, res, next)
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
