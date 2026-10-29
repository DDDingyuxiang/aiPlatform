import { Router, type RequestHandler } from 'express'
import {
  aiChatRequestSchema,
  aiConversationCreateSchema,
  aiConversationHistoryQuerySchema,
  aiMessageSendSchema,
} from '@aiplatform/contracts'
import { sendSuccess } from '../../http/envelope.js'
import { requireAuthContext } from '../identity/index.js'
import { closeSse, openSse, writeSse } from './stream.js'
import type { AiChatService, AiConversationService } from './types.js'

export interface AiRouterOptions {
  service: AiChatService
  conversationService: AiConversationService
  requireAuth: RequestHandler
}

/** AI 接口：/api/v1/ai */
export function createAiRouter(options: AiRouterOptions): Router {
  const router = Router()
  const { service, conversationService, requireAuth } = options

  // 旧的无状态接口，保留兼容；新前端使用持久化会话接口
  router.post('/chat', requireAuth, async (req, res) => {
    const payload = aiChatRequestSchema.parse(req.body)
    const result = await service.chat(requireAuthContext(req), payload)
    sendSuccess(res, result, req.requestId)
  })

  router.get('/conversations', requireAuth, async (req, res) => {
    const result = await conversationService.listConversations(
      requireAuthContext(req),
    )
    sendSuccess(res, result, req.requestId)
  })

  router.get('/summaries', requireAuth, async (req, res) => {
    const result = await conversationService.listSummaryHistory(
      requireAuthContext(req),
    )
    sendSuccess(res, result, req.requestId)
  })

  router.post('/conversations', requireAuth, async (req, res) => {
    const payload = aiConversationCreateSchema.parse(req.body ?? {})
    const result = await conversationService.createConversation(
      requireAuthContext(req),
      payload,
    )
    sendSuccess(res, result, req.requestId)
  })

  router.get('/conversations/:conversationId/messages', requireAuth, async (req, res) => {
    const query = aiConversationHistoryQuerySchema.parse(req.query)
    const result = await conversationService.history(
      requireAuthContext(req),
      String(req.params.conversationId),
      query,
    )
    sendSuccess(res, result, req.requestId)
  })

  router.post('/conversations/:conversationId/messages', requireAuth, async (req, res) => {
    const payload = aiMessageSendSchema.parse(req.body)
    const result = await conversationService.sendMessage(
      requireAuthContext(req),
      String(req.params.conversationId),
      payload,
    )
    sendSuccess(res, result, req.requestId)
  })

  /**
   * 流式发送：先拉取首个事件（会完成鉴权、会话校验与消息落库），
   * 成功后再切换为 SSE；此时错误只能以 error 事件返回。
   */
  router.post(
    '/conversations/:conversationId/messages/stream',
    requireAuth,
    async (req, res) => {
      const payload = aiMessageSendSchema.parse(req.body)
      const controller = new AbortController()
      const generator = conversationService.chatStream(
        requireAuthContext(req),
        String(req.params.conversationId),
        payload,
        { signal: controller.signal },
      )

      const first = await generator.next()
      if (first.done) {
        res.status(204).end()
        return
      }

      const stopHeartbeat = openSse(res)
      const onClose = (): void => {
        if (!res.writableEnded) controller.abort()
      }
      res.on('close', onClose)

      try {
        writeSse(res, first.value.type, first.value)
        for await (const event of generator) {
          writeSse(res, event.type, event)
        }
      } catch (error) {
        // 生成器内部已尽量转为 error 事件；这里是最后兜底
        writeSse(res, 'error', {
          type: 'error',
          code: 'AI_STREAM_FAILED',
          message:
            error instanceof Error ? error.message.slice(0, 200) : '流式响应异常',
          retryable: true,
        })
      } finally {
        res.off('close', onClose)
        stopHeartbeat()
        closeSse(res)
      }
    },
  )

  router.delete('/conversations/:conversationId', requireAuth, async (req, res) => {
    await conversationService.deleteConversation(
      requireAuthContext(req),
      String(req.params.conversationId),
    )
    sendSuccess(res, { deleted: true }, req.requestId)
  })

  return router
}
