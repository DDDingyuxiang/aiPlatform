import { Router, type RequestHandler } from 'express'
import { loginPayloadSchema, profileUpdateSchema } from '@aiplatform/contracts'
import { sendSuccess } from '../../http/envelope.js'
import { requireAuthContext } from './auth-middleware.js'
import type { IdentityService } from './types.js'

export interface AuthRouterOptions {
  service: IdentityService
  requireAuth: RequestHandler
}

/** 认证接口：/api/v1/auth */
export function createAuthRouter(options: AuthRouterOptions): Router {
  const router = Router()
  const { service, requireAuth } = options

  router.post('/login', async (req, res) => {
    const payload = loginPayloadSchema.parse(req.body)
    const result = await service.login(payload)
    sendSuccess(res, result, req.requestId)
  })

  router.post('/logout', requireAuth, async (req, res) => {
    const result = await service.logout(requireAuthContext(req))
    sendSuccess(res, result, req.requestId)
  })

  router.get('/profile', requireAuth, async (req, res) => {
    const user = await service.profile(requireAuthContext(req))
    sendSuccess(res, user, req.requestId)
  })

  router.patch('/profile', requireAuth, async (req, res) => {
    const payload = profileUpdateSchema.parse(req.body)
    const user = await service.updateProfile(requireAuthContext(req), payload)
    sendSuccess(res, user, req.requestId)
  })

  return router
}
