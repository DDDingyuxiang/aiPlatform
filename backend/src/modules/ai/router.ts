import { Router, type RequestHandler } from 'express'
import { aiChatRequestSchema } from '@aiplatform/contracts'
import { sendSuccess } from '../../http/envelope.js'
import { requireAuthContext } from '../identity/index.js'
import type { AiChatService } from './types.js'

export interface AiRouterOptions {
  service: AiChatService
  requireAuth: RequestHandler
}

/** AI 接口：/api/v1/ai */
export function createAiRouter(options: AiRouterOptions): Router {
  const router = Router()
  const { service, requireAuth } = options

  router.post('/chat', requireAuth, async (req, res) => {
    const payload = aiChatRequestSchema.parse(req.body)
    const result = await service.chat(requireAuthContext(req), payload)
    sendSuccess(res, result, req.requestId)
  })

  return router
}
