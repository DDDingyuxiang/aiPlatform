import { Router, type RequestHandler } from 'express'
import {
  createApprovalPayloadSchema,
  decisionPayloadSchema,
} from '@aiplatform/contracts'
import { sendSuccess } from '../../http/envelope.js'
import { requireAuthContext } from '../identity/index.js'
import type { WorkflowService } from './types.js'

export function createWorkflowRouter(options: {
  service: WorkflowService
  requireAuth: RequestHandler
}): Router {
  const router = Router()
  router.use(options.requireAuth)

  router.get('/approvals', async (req, res) => {
    const result = await options.service.list(requireAuthContext(req))
    sendSuccess(res, result, req.requestId)
  })

  router.post('/approvals', async (req, res) => {
    const payload = createApprovalPayloadSchema.parse(req.body)
    const result = await options.service.create(requireAuthContext(req), payload)
    sendSuccess(res, result, req.requestId)
  })

  router.post('/approvals/:id/decision', async (req, res) => {
    const payload = decisionPayloadSchema.parse(req.body)
    const result = await options.service.decide(
      requireAuthContext(req),
      String(req.params.id),
      payload,
    )
    sendSuccess(res, result, req.requestId)
  })

  return router
}
