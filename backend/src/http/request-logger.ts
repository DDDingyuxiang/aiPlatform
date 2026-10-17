import type { RequestHandler } from 'express'
import type { Logger } from '../shared/logger.js'

/** 记录请求结果；只记录路径，不记录查询串与请求体，避免泄露敏感参数 */
export function createRequestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const startedAt = performance.now()
    // 在进入路由前捕获原始路径；路由处理后 req.path 可能是挂载点内的相对路径
    const method = req.method
    const path = req.originalUrl.split('?')[0] ?? req.originalUrl
    res.on('finish', () => {
      logger.info('http.request', {
        requestId: req.requestId,
        method,
        path,
        status: res.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
      })
    })
    next()
  }
}
