import { randomUUID } from 'node:crypto'
import type { RequestHandler } from 'express'

const REQUEST_ID_HEADER = 'x-request-id'
const VALID_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/

/** 接收上游请求 ID；缺失或格式非法时生成新的 UUID */
export function requestIdMiddleware(): RequestHandler {
  return (req, res, next) => {
    const incoming = req.header(REQUEST_ID_HEADER)
    req.requestId = incoming && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID()
    res.setHeader('X-Request-Id', req.requestId)
    next()
  }
}
