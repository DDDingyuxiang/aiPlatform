import express, { Router, type RequestHandler } from 'express'
import {
  knowledgeSearchQuerySchema,
  knowledgeUploadQuerySchema,
} from '@aiplatform/contracts'
import { AppError, ErrorCode } from '../../http/errors.js'
import { sendSuccess } from '../../http/envelope.js'
import { requireAuthContext } from '../identity/index.js'
import type { KnowledgeService } from './types.js'

export interface KnowledgeRouterOptions {
  service: KnowledgeService
  requireAuth: RequestHandler
  maxUploadBytes: number
}

/** 知识库接口：/api/v1/knowledge */
export function createKnowledgeRouter(options: KnowledgeRouterOptions): Router {
  const router = Router()
  const { service, requireAuth, maxUploadBytes } = options

  router.use(requireAuth)

  router.get('/documents', async (req, res) => {
    const result = await service.list(requireAuthContext(req))
    sendSuccess(res, result, req.requestId)
  })

  /**
   * 上传文档：请求体为原始文件二进制，元数据通过查询参数传递。
   * 与聊天附件一致，使用 application/octet-stream 避免被 JSON 解析器消费。
   */
  router.post(
    '/documents',
    express.raw({ type: () => true, limit: maxUploadBytes }),
    async (req, res) => {
      const query = knowledgeUploadQuerySchema.parse(req.query)
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        throw new AppError(ErrorCode.INVALID_PAYLOAD, '文件不能为空', 400)
      }

      const result = await service.upload(requireAuthContext(req), {
        ...query,
        data: req.body,
      })
      sendSuccess(res, result, req.requestId)
    },
  )

  router.get('/search', async (req, res) => {
    const query = knowledgeSearchQuerySchema.parse(req.query)
    const result = await service.search(requireAuthContext(req), query)
    sendSuccess(res, result, req.requestId)
  })

  router.get('/documents/:publicId/download', async (req, res) => {
    const file = await service.download(
      requireAuthContext(req),
      req.params.publicId,
    )

    res.setHeader('Content-Type', file.mimeType)
    res.setHeader('Content-Length', String(file.sizeBytes))
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    )
    file.stream.on('error', () => {
      if (!res.headersSent) {
        res.status(500).end()
      } else {
        res.end()
      }
    })
    file.stream.pipe(res)
  })

  return router
}
