import express, { Router, type Express } from 'express'
import cors from 'cors'
import { sendSuccess } from './http/envelope.js'
import { createErrorHandler } from './http/error-handler.js'
import { AppError, ErrorCode } from './http/errors.js'
import { notFoundHandler } from './http/not-found.js'
import { createRequestLogger } from './http/request-logger.js'
import { requestIdMiddleware } from './http/request-id.js'
import type { Logger } from './shared/logger.js'

export interface CreateAppOptions {
  /** identity 模块导出的认证路由 */
  authRouter: Router
  /** identity 模块导出的组织/考勤路由 */
  identityRouter: Router
  /** 检查数据库等关键依赖；失败时健康检查返回 503 */
  healthCheck: () => Promise<void>
  corsOrigins: string[]
  logger: Logger
}

/**
 * 组装 Express 应用。
 * 依赖由调用方注入，便于测试时替换数据库与外部资源。
 */
export function createApp(options: CreateAppOptions): Express {
  const app = express()
  app.disable('x-powered-by')

  app.use(requestIdMiddleware())
  app.use(createRequestLogger(options.logger))
  app.use(
    cors({
      origin: options.corsOrigins,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
      maxAge: 600,
    }),
  )
  app.use(express.json({ limit: '1mb' }))

  const api = Router()

  /** 健康检查不要求登录，供容器探针使用 */
  api.get('/health', async (req, res) => {
    try {
      await options.healthCheck()
    } catch (error) {
      throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, '数据库连接不可用', 503, {
        cause: error,
      })
    }
    sendSuccess(res, { status: 'ok' }, req.requestId)
  })

  api.use('/auth', options.authRouter)
  api.use('/identity', options.identityRouter)

  app.use('/api/v1', api)
  app.use(notFoundHandler())
  app.use(createErrorHandler(options.logger))

  return app
}
