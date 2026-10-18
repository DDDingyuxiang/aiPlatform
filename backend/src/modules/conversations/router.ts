import express, { Router, type RequestHandler } from 'express'
import {
  createConversationSchema,
  sendMessageSchema,
  uploadAttachmentQuerySchema,
} from '@aiplatform/contracts'
import { sendSuccess } from '../../http/envelope.js'
import { AppError, ErrorCode } from '../../http/errors.js'
import { userTopic, type RealtimeBus } from '../../infra/realtime.js'
import { requireAuthContext } from '../identity/index.js'
import type { ConversationsService } from './types.js'

export interface ConversationsRouterOptions {
  service: ConversationsService
  requireAuth: RequestHandler
  /** Redis Pub/Sub 实时事件总线 */
  realtime: RealtimeBus
  /** 校验登录会话是否仍有效（退出/停用后关闭 SSE） */
  validateSession: (sessionId: string) => Promise<boolean>
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
  const { service, requireAuth, realtime, validateSession, maxUploadBytes } = options

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

  router.post('/conversations/:conversationId/read', async (req, res) => {
    const result = await service.markRead(
      requireAuthContext(req),
      req.params.conversationId,
    )
    sendSuccess(res, result, req.requestId)
  })

  /**
   * 实时事件流（SSE）。
   *
   * 订阅当前员工的 Redis 主题，推送聊天消息与通知；
   * 心跳用于保持连接并穿透反向代理的空闲超时。
   */
  router.get('/events', async (req, res) => {
    const auth = requireAuthContext(req)

    let unsubscribe: (() => Promise<void>) | null = null
    try {
      unsubscribe = await realtime.subscribe(
        userTopic(auth.tenantId, auth.employeeId),
        (event) => {
          if (res.writableEnded) return
          res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
        },
      )
    } catch (error) {
      throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, '实时消息服务不可用', 503, {
        cause: error,
      })
    }

    res.status(200)
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()
    res.write(
      `event: connected\ndata: ${JSON.stringify({ type: 'connected', at: new Date().toISOString() })}\n\n`,
    )

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': ping\n\n')
    }, 25_000)

    // 长连接期间定期复核 Redis 会话：退出登录或账号被停用后主动断开
    const sessionCheck = setInterval(() => {
      void (async () => {
        let active = false
        try {
          active = auth.sessionId
            ? await validateSession(auth.sessionId)
            : false
        } catch {
          active = false
        }
        if (!active && !res.writableEnded) res.end()
      })()
    }, 30_000)

    req.on('close', () => {
      clearInterval(heartbeat)
      clearInterval(sessionCheck)
      if (unsubscribe) void unsubscribe()
    })
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
