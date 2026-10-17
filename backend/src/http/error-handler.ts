import type { ErrorRequestHandler } from 'express'
import { ZodError } from 'zod'
import { sendFailure } from './envelope.js'
import { AppError, ErrorCode } from './errors.js'
import type { Logger } from '../shared/logger.js'

/**
 * 统一错误出口：
 * - ZodError → 40000（不向前端暴露内部校验细节）；
 * - AppError → 使用其稳定错误码与 HTTP 状态；
 * - 其他异常 → 50000，仅在服务端日志中保留堆栈。
 */
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, req, res, _next) => {
    if (res.headersSent) return

    const requestId = req.requestId ?? '-'
    const path = req.originalUrl.split('?')[0] ?? req.originalUrl

    // express.json() 的解析错误（非法 JSON / 请求体过大）
    const bodyParserError = error as { type?: unknown; status?: unknown }
    if (bodyParserError.type === 'entity.parse.failed') {
      sendFailure(res, ErrorCode.INVALID_PAYLOAD, '请求体不是合法 JSON', requestId, 400)
      return
    }
    if (bodyParserError.type === 'entity.too.large') {
      sendFailure(res, ErrorCode.INVALID_PAYLOAD, '请求体过大', requestId, 413)
      return
    }

    if (error instanceof ZodError) {
      logger.warn('request.validation_failed', {
        requestId,
        issues: error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      })
      sendFailure(res, ErrorCode.INVALID_PAYLOAD, '请求参数不合法', requestId, 400)
      return
    }

    if (error instanceof AppError) {
      const fields = {
        requestId,
        code: error.code,
        status: error.status,
        method: req.method,
        path,
      }
      if (error.status >= 500) {
        logger.error('request.failed', { ...fields, error: error.message })
      } else {
        logger.warn('request.rejected', { ...fields, error: error.message })
      }
      sendFailure(res, error.code, error.message, requestId, error.status)
      return
    }

    logger.error('request.unhandled_error', {
      requestId,
      method: req.method,
      path,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    sendFailure(res, ErrorCode.INTERNAL, '服务器内部错误', requestId, 500)
  }
}
