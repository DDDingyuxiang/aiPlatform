import type { RequestHandler } from 'express'
import { AppError, ErrorCode } from './errors.js'

export function notFoundHandler(): RequestHandler {
  return (req, _res, next) => {
    const path = req.originalUrl.split('?')[0] ?? req.originalUrl
    next(new AppError(ErrorCode.NOT_FOUND, `接口不存在：${req.method} ${path}`, 404))
  }
}
