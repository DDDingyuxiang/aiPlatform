import { describe, expect, it, vi } from 'vitest'
import { emitRealtimeEvent, onRealtimeEvent } from '../index'

describe('core realtime event bus', () => {
  it('按事件类型分发并支持取消订阅', () => {
    const taskHandler = vi.fn()
    const chatHandler = vi.fn()
    const offTask = onRealtimeEvent('task.created', taskHandler)
    const offChat = onRealtimeEvent('chat.message', chatHandler)

    emitRealtimeEvent({ type: 'task.created', payload: { task: { title: 'A' } } })
    expect(taskHandler).toHaveBeenCalledTimes(1)
    expect(taskHandler.mock.calls[0]?.[0]).toMatchObject({
      type: 'task.created',
      payload: { task: { title: 'A' } },
    })
    expect(chatHandler).not.toHaveBeenCalled()

    offTask()
    emitRealtimeEvent({ type: 'task.created', payload: {} })
    expect(taskHandler).toHaveBeenCalledTimes(1)

    offChat()
  })

  it('某个处理器异常时不影响其他订阅者', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const healthy = vi.fn()
    const offBad = onRealtimeEvent('demo', () => {
      throw new Error('boom')
    })
    const offGood = onRealtimeEvent('demo', healthy)

    emitRealtimeEvent({ type: 'demo', payload: 1 })
    expect(healthy).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalled()

    offBad()
    offGood()
    error.mockRestore()
  })
})
