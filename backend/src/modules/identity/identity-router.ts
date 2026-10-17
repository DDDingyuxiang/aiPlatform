import { Router, type RequestHandler } from 'express'
import { sendSuccess } from '../../http/envelope.js'
import { requireAuthContext } from './auth-middleware.js'
import type { IdentityService } from './types.js'

export interface IdentityRouterOptions {
  service: IdentityService
  requireAuth: RequestHandler
}

/** 身份与组织接口：/api/v1/identity */
export function createIdentityRouter(options: IdentityRouterOptions): Router {
  const router = Router()
  const { service, requireAuth } = options

  router.get('/directory', requireAuth, async (req, res) => {
    const result = await service.directory(requireAuthContext(req))
    sendSuccess(res, result, req.requestId)
  })

  router.get('/attendance', requireAuth, async (req, res) => {
    const result = await service.attendance(requireAuthContext(req))
    sendSuccess(res, result, req.requestId)
  })

  return router
}
