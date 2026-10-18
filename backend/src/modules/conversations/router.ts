import express, { Router, type RequestHandler } from 'express'
import {
  createConversationSchema,
  sendMessageSchema,
  uploadAttachmentQuerySchema,
} from '@aiplatform/contracts'
import { sendSuccess } from '../../http/envelope.js'
import { AppError, ErrorCode } from '../../http/errors.js'
import { requireAuthContext } from '../identity/index.js'
import type { ConversationsService } from './types.js'

export interface ConversationsRouterOptions {
  service: ConversationsService
  requireAuth: RequestHandler
  /** 单个附件大小上限（字节） */
  maxUploadBytes: number
}

/**
 * 对话接口：/api/v1/chat
 *
 * 所有接口都要求登录，并在服务层校验会话成员资格；
 * 租户 ID 只取认证上下文，不接受前端传值。
 */
export function createConversationsRouter(options: ConversationsRouterOptions): Router {
  const router = Router()
  const { service, requireAuth, maxUploadBytes } = options

  router.use(requireAuth)

  router.get('/conversations', async (req, res) => {
    const result = await service.list(requireAuthContext(req))
    sendSuccess(res, result, req.requestId)
  })

  router.post('/conversations', async (req, res) => {
    const payload = createConversationSchema.parse(req.body)
    const result = await service.create(requireAuthContext(req), payload)
    sendSuccess(res, result, req.requestId)
  })

  router.get('/conversations/:conversationId/messages', async (req, res) => {
    const result = await service.listMessages(
      requireAuthContext(req),
      req.params.conversationId,
    )
    sendSuccess(res, result, req.requestId)
  })

  router.post('/conversations/:conversationId/messages', async (req, res) => {
    const payload = sendMessageSchema.parse(req.body)
    const result = await service.sendMessage(
      requireAuthContext(req),
      req.params.conversationId,
      payload,
    )
    sendSuccess(res, result, req.requestId)
  })

  /**
   * 附件上传：请求体为原始二进制。
   *
   * 实际 MIME 放在 X-File-Type 头，请求体统一用 application/octet-stream，
   * 避免全局 JSON 解析器误消费 JSON 类型文件。
   */
  router.post(
    '/conversations/:conversationId/attachments',
    express.raw({ type: () => true, limit: maxUploadBytes }),
    async (req, res) => {
      const query = uploadAttachmentQuerySchema.parse(req.query)
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        throw new AppError(ErrorCode.INVALID_PAYLOAD, '文件不能为空', 400)
      }

      const result = await service.sendAttachment(
        requireAuthContext(req),
        req.params.conversationId,
        {
          fileName: query.fileName,
          mimeType:
            req.header('x-file-type') ?? req.header('content-type') ?? 'application/octet-stream',
          data: req.body,
          caption: query.caption,
        },
      )
      sendSuccess(res, result, req.requestId)
    },
  )

  router.get(
    '/conversations/:conversationId/attachments/:attachmentId',
    async (req, res) => {
      const attachment = await service.getAttachment(
        requireAuthContext(req),
        req.params.conversationId,
        req.params.attachmentId,
      )

      const disposition = attachment.mimeType.startsWith('image/') ? 'inline' : 'attachment'
      res.setHeader('Content-Type', attachment.mimeType)
      res.setHeader('Content-Length', String(attachment.sizeBytes))
      res.setHeader(
        'Content-Disposition',
        `${disposition}; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
      )

      attachment.stream.on('error', () => {
        if (!res.headersSent) res.end()
        else res.destroy()
      })
      attachment.stream.pipe(res)
    },
  )

  return router
}
