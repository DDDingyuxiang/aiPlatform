/**
 * 前端实时事件总线。
 *
 * SSE 连接由 chat store 维护；解析后的事件通过这里分发给各业务模块，
 * 避免模块之间相互依赖（例如任务模块监听 task.created）。
 */
export interface RealtimeEnvelope {
  type: string
  payload: unknown
  at?: string
}

type RealtimeHandler = (event: RealtimeEnvelope) => void

const handlers = new Map<string, Set<RealtimeHandler>>()

export function emitRealtimeEvent(event: RealtimeEnvelope): void {
  const listeners = handlers.get(event.type)
  if (!listeners) return
  for (const listener of listeners) {
    try {
      listener(event)
    } catch (error) {
      console.error('[realtime] 事件处理失败', error)
    }
  }
}

/** 订阅指定事件；返回取消订阅函数 */
export function onRealtimeEvent(
  type: string,
  handler: RealtimeHandler,
): () => void {
  const listeners = handlers.get(type) ?? new Set<RealtimeHandler>()
  listeners.add(handler)
  handlers.set(type, listeners)
  return () => {
    listeners.delete(handler)
    if (listeners.size === 0) handlers.delete(type)
  }
}
