import express, { Router, type RequestHandler } from 'express'
import {
  knowledgeDocumentStatusQuerySchema,
  knowledgeDownloadQuerySchema,
  knowledgeSearchQuerySchema,
  knowledgeUploadQuerySchema,
  knowledgeVersionUploadQuerySchema,
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

  /** 显式上传新版本：文件本体放请求体，文件名走查询参数 */
  router.post(
    '/documents/:publicId/versions',
    express.raw({ type: () => true, limit: maxUploadBytes }),
    async (req, res) => {
      const query = knowledgeVersionUploadQuerySchema.parse(req.query)
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        throw new AppError(ErrorCode.INVALID_PAYLOAD, '文件不能为空', 400)
      }
      const result = await service.uploadVersion(
        requireAuthContext(req),
        String(req.params.publicId),
        { ...query, data: req.body },
      )
      sendSuccess(res, result, req.requestId)
    },
  )

  router.get('/documents/:publicId/status', async (req, res) => {
    const query = knowledgeDocumentStatusQuerySchema.parse(req.query)
    const result = await service.status(
      requireAuthContext(req),
      String(req.params.publicId),
      query.versionNo,
    )
    sendSuccess(res, result, req.requestId)
  })

  router.get('/documents/:publicId/versions', async (req, res) => {
    const result = await service.listVersions(
      requireAuthContext(req),
      String(req.params.publicId),
    )
    sendSuccess(res, result, req.requestId)
  })

  router.post(
    '/documents/:publicId/versions/:versionNo/activate',
    async (req, res) => {
      const { versionNo } = knowledgeDownloadQuerySchema.parse({
        versionNo: req.params.versionNo,
      })
      if (versionNo === undefined) {
        throw new AppError(ErrorCode.INVALID_PAYLOAD, '版本号不能为空', 400)
      }
      const result = await service.activateVersion(
        requireAuthContext(req),
        String(req.params.publicId),
        versionNo,
      )
      sendSuccess(res, result, req.requestId)
    },
  )

  router.post(
    '/documents/:publicId/versions/:versionNo/reindex',
    async (req, res) => {
      const { versionNo } = knowledgeDownloadQuerySchema.parse({
        versionNo: req.params.versionNo,
      })
      if (versionNo === undefined) {
        throw new AppError(ErrorCode.INVALID_PAYLOAD, '版本号不能为空', 400)
      }
      const result = await service.reindexVersion(
        requireAuthContext(req),
        String(req.params.publicId),
        versionNo,
      )
      sendSuccess(res, result, req.requestId)
    },
  )

  router.delete('/documents/:publicId', async (req, res) => {
    await service.deleteDocument(
      requireAuthContext(req),
      String(req.params.publicId),
    )
    sendSuccess(res, { deleted: true }, req.requestId)
  })

  router.get('/search', async (req, res) => {
    const query = knowledgeSearchQuerySchema.parse(req.query)
    const result = await service.search(requireAuthContext(req), query)
    sendSuccess(res, result, req.requestId)
  })

  router.get('/documents/:publicId/download', async (req, res) => {
    const query = knowledgeDownloadQuerySchema.parse(req.query)
    const file = await service.download(
      requireAuthContext(req),
      String(req.params.publicId),
      query.versionNo,
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
