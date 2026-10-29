import { Router, type RequestHandler } from 'express'
import { analyticsOverviewSchema, analyticsRangeSchema } from '@aiplatform/contracts'
import { sendSuccess } from '../../http/envelope.js'
import { requireAuthContext } from '../identity/index.js'
import type { AnalyticsService } from './types.js'

export function createAnalyticsRouter(options: {
  service: AnalyticsService
  requireAuth: RequestHandler
}): Router {
  const router = Router()
  router.use(options.requireAuth)

  router.get('/overview', async (req, res) => {
    const range = analyticsRangeSchema.parse(req.query.range ?? 'd30')
    const overview = await options.service.overview(requireAuthContext(req), range)
    sendSuccess(res, analyticsOverviewSchema.parse(overview), req.requestId)
  })

  return router
}
