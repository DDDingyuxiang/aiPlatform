import { Router, type RequestHandler } from 'express'
import { taskCreatePayloadSchema, taskUpdatePayloadSchema } from '@aiplatform/contracts'
import { sendSuccess } from '../../http/envelope.js'
import { requireAuthContext } from '../identity/index.js'
import type { TasksService } from './types.js'

export interface TasksRouterOptions {
  service: TasksService
  requireAuth: RequestHandler
}

/** 任务接口：/api/v1/tasks */
export function createTasksRouter(options: TasksRouterOptions): Router {
  const router = Router()
  const { service, requireAuth } = options

  router.use(requireAuth)

  router.get('/', async (req, res) => {
    const result = await service.list(requireAuthContext(req))
    sendSuccess(res, result, req.requestId)
  })

  router.get('/milestones', async (req, res) => {
    const result = await service.milestones(requireAuthContext(req))
    sendSuccess(res, result, req.requestId)
  })

  router.post('/', async (req, res) => {
    const payload = taskCreatePayloadSchema.parse(req.body)
    const result = await service.create(requireAuthContext(req), payload)
    sendSuccess(res, result, req.requestId)
  })

  router.patch('/:id', async (req, res) => {
    const payload = taskUpdatePayloadSchema.parse(req.body)
    const result = await service.updateStatus(
      requireAuthContext(req),
      req.params.id,
      payload,
    )
    sendSuccess(res, result, req.requestId)
  })

  return router
}
