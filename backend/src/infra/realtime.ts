import type { RedisClient } from './redis.js'
import type { Logger } from '../shared/logger.js'

/** 实时事件：type 对应 SSE 的 event 字段，payload 为 JSON 数据 */
export interface RealtimeEvent {
  type: string
  payload: unknown
  at?: string
}

export type RealtimeHandler = (event: RealtimeEvent) => void

/**
 * 实时消息总线。
 *
 * 业务层只按“用户主题”发布事件；Redis Pub/Sub 负责跨实例分发。
 * 推送失败不应影响消息落库，因此发布方可选择忽略异常。
 */
export interface RealtimeBus {
  publish(topic: string, event: RealtimeEvent): Promise<void>
  /** 返回取消订阅函数 */
  subscribe(topic: string, handler: RealtimeHandler): Promise<() => Promise<void>>
  close(): Promise<void>
}

/** 每个员工的实时主题；租户隔离，避免跨企业推送 */
export function userTopic(tenantId: string, employeeId: string): string {
  return `user:${tenantId}:${employeeId}`
}

export function createRedisRealtimeBus(
  publisher: RedisClient,
  channelPrefix: string,
  logger?: Logger,
): RealtimeBus {
  const subscriber = publisher.duplicate()
  const handlers = new Map<string, Set<RealtimeHandler>>()

  subscriber.on('error', (error: Error) => {
    logger?.warn('realtime.subscriber_error', { error: error.message })
  })

  subscriber.on('message', (channel: string, raw: string) => {
    const listeners = handlers.get(channel)
    if (!listeners || listeners.size === 0) return

    let event: RealtimeEvent
    try {
      event = JSON.parse(raw) as RealtimeEvent
    } catch {
      logger?.warn('realtime.invalid_event', { channel })
      return
    }

    for (const listener of listeners) listener(event)
  })

  function channelOf(topic: string): string {
    return `${channelPrefix}${topic}`
  }

  return {
    async publish(topic, event) {
      await publisher.publish(
        channelOf(topic),
        JSON.stringify({ ...event, at: event.at ?? new Date().toISOString() }),
      )
    },

    async subscribe(topic, handler) {
      const channel = channelOf(topic)
      const listeners = handlers.get(channel) ?? new Set<RealtimeHandler>()
      listeners.add(handler)
      handlers.set(channel, listeners)

      if (listeners.size === 1) await subscriber.subscribe(channel)

      let active = true
      return async () => {
        if (!active) return
        active = false
        listeners.delete(handler)
        if (listeners.size === 0) {
          handlers.delete(channel)
          await subscriber.unsubscribe(channel)
        }
      }
    },

    async close() {
      handlers.clear()
      try {
        await subscriber.quit()
      } catch {
        subscriber.disconnect()
      }
    },
  }
}

/** 内存实现，仅用于测试 */
export function createMemoryRealtimeBus(): RealtimeBus {
  const listeners = new Map<string, Set<RealtimeHandler>>()

  return {
    async publish(topic, event) {
      const set = listeners.get(topic)
      if (!set) return
      const payload = { ...event, at: event.at ?? new Date().toISOString() }
      for (const listener of set) listener(payload)
    },
    async subscribe(topic, handler) {
      const set = listeners.get(topic) ?? new Set<RealtimeHandler>()
      set.add(handler)
      listeners.set(topic, set)
      return async () => {
        set.delete(handler)
        if (set.size === 0) listeners.delete(topic)
      }
    },
    async close() {
      listeners.clear()
    },
  }
}
