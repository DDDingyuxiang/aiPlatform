import { Router, type RequestHandler } from 'express'
import { createAnnouncementPayloadSchema } from '@aiplatform/contracts'
import { sendSuccess } from '../../http/envelope.js'
import { requireAuthContext } from '../identity/index.js'
import type { AnnouncementsService } from './types.js'

export function createAnnouncementsRouter(options: {
  service: AnnouncementsService
  requireAuth: RequestHandler
  requirePublish: RequestHandler
}): Router {
  const router = Router()
  router.use(options.requireAuth)

  router.get('/', async (req, res) => {
    sendSuccess(res, await options.service.list(requireAuthContext(req)), req.requestId)
  })
  router.patch('/:id/read', async (req, res) => {
    await options.service.markRead(requireAuthContext(req), req.params.id)
    sendSuccess(res, { ok: true }, req.requestId)
  })
  router.post('/read-all', async (req, res) => {
    await options.service.markAllRead(requireAuthContext(req))
    sendSuccess(res, { ok: true }, req.requestId)
  })
  router.post('/', options.requirePublish, async (req, res) => {
    const payload = createAnnouncementPayloadSchema.parse(req.body)
    await options.service.create(requireAuthContext(req), payload)
    sendSuccess(res, { ok: true }, req.requestId)
  })

  return router
}
