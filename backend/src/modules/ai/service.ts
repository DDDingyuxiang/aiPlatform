import { aiChatResponseSchema, type AiChatRequest, type AiChatResponse } from '@aiplatform/contracts'
import { AppError, ErrorCode } from '../../http/errors.js'
import type { Logger } from '../../shared/logger.js'
import type { AuthContext } from '../identity/index.js'
import type { AiChatService } from './types.js'

const SYSTEM_PROMPT = [
  '你是「智擎 AI」企业智能助手，服务对象是企业员工。',
  '请使用简洁、专业的中文回答；不确定时明确说明，不编造事实。',
  '不要输出任何密钥、密码或与当前问题无关的内部信息。',
].join('\n')

export interface AiServiceOptions {
  /** Python AI 服务地址，例如 http://127.0.0.1:8000 */
  serviceUrl: string
  timeoutMs: number
  logger?: Logger
  /** 便于测试替换 */
  systemPrompt?: string
}

interface AiServiceResult {
  message: { role: string; content: string }
  model?: string
}

/**
 * 业务后端 → 独立 AI 服务适配器。
 *
 * 业务模块不直接调用模型供应商；超时、错误码与响应校验都在这里统一处理。
 */
export function createAiService(options: AiServiceOptions): AiChatService {
  const { serviceUrl, timeoutMs, logger, systemPrompt = SYSTEM_PROMPT } = options

  async function callAiService(payload: AiChatRequest): Promise<AiServiceResult> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const started = Date.now()

    try {
      const response = await fetch(`${serviceUrl}/v1/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // 预留一条系统提示，客户端历史最多保留 19 条
          messages: [
            { role: 'system', content: systemPrompt },
            ...payload.messages.slice(-19),
          ],
          ...(payload.temperature === undefined
            ? {}
            : { temperature: payload.temperature }),
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        logger?.warn('ai.service_rejected', {
          status: response.status,
          elapsedMs: Date.now() - started,
        })
        if (response.status === 504) {
          throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'AI 服务响应超时', 504)
        }
        throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'AI 服务暂不可用', 503)
      }

      return (await response.json()) as AiServiceResult
    } catch (error) {
      if (error instanceof AppError) throw error
      if (error instanceof DOMException && error.name === 'AbortError') {
        logger?.warn('ai.request_timeout', { timeoutMs })
        throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'AI 服务响应超时', 504)
      }
      logger?.error('ai.request_failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'AI 服务暂不可用', 503)
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    async chat(auth: AuthContext, payload: AiChatRequest): Promise<AiChatResponse> {
      const started = Date.now()
      const result = await callAiService(payload)

      // 模型输出始终视为不可信输入，必须按契约校验后才能返回给前端
      const parsed = aiChatResponseSchema.safeParse({
        message: result.message,
        model: result.model,
      })
      if (!parsed.success) {
        logger?.error('ai.invalid_response', {
          tenantId: auth.tenantId,
          employeeId: auth.employeeId,
          issues: parsed.error.issues.map((issue) => issue.path.join('.')),
        })
        throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'AI 服务返回格式异常', 502)
      }

      logger?.info('ai.chat_completed', {
        tenantId: auth.tenantId,
        employeeId: auth.employeeId,
        messages: payload.messages.length,
        elapsedMs: Date.now() - started,
      })

      return parsed.data
    },
  }
}
