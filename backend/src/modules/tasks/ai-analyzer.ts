import { extractedTaskSchema, type ExtractedTask } from '@aiplatform/contracts'
import type { Logger } from '../../shared/logger.js'
import type { AiTaskAnalyzer } from './types.js'

export interface AiTaskAnalyzerOptions {
  serviceUrl: string
  timeoutMs: number
  logger?: Logger
}

/**
 * 调用 Python AI 服务的任务抽取接口。
 *
 * 返回 null 表示“没有任务 / 服务不可用 / 输出不合法”，调用方不落库；
 * 任务脚本属于增强能力，失败不能影响聊天本身。
 */
export function createAiTaskAnalyzer(options: AiTaskAnalyzerOptions): AiTaskAnalyzer {
  const { serviceUrl, timeoutMs, logger } = options

  return {
    async extract(input): Promise<ExtractedTask | null> {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      const started = Date.now()

      try {
        const response = await fetch(`${serviceUrl}/v1/tasks/extract`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
          signal: controller.signal,
        })

        if (!response.ok) {
          logger?.warn('tasks.ai_extract_rejected', {
            status: response.status,
            elapsedMs: Date.now() - started,
          })
          return null
        }

        const parsed = extractedTaskSchema.safeParse(await response.json())
        if (!parsed.success) {
          logger?.warn('tasks.ai_extract_invalid', {
            issues: parsed.error.issues.map((issue) => issue.path.join('.')),
          })
          return null
        }

        logger?.info('tasks.ai_extract_completed', {
          create: parsed.data.create,
          elapsedMs: Date.now() - started,
        })
        return parsed.data
      } catch (error) {
        logger?.warn('tasks.ai_extract_failed', {
          error: error instanceof Error ? error.message : String(error),
        })
        return null
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
