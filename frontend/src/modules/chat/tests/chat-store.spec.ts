/**
 * 对话 store 测试：会话加载与未读、消息发送与演示回复、私聊复用与群聊创建。
 * 注意：Mock 层的会话/消息为模块级状态，本文件内的用例按顺序共享该状态。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, type Pinia } from 'pinia'
import { useAuthStore } from '@/core/auth/store'
import { clearToken } from '@/core/auth/token'
import { useChatStore } from '@/modules/chat'
import { chatApi } from '../api'
import '@/core/auth/mock'
import '@/modules/identity/mock'
import '@/modules/chat/mock'

let pinia: Pinia

/** 以演示账号登录（令牌是 Mock 接口鉴权上下文） */
async function loginAsAdmin(): Promise<void> {
  const auth = useAuthStore(pinia)
  const pending = auth.login({ username: 'admin', password: '123456', remember: false })
  await vi.advanceTimersByTimeAsync(500)
  await pending
}

async function flush(ms = 500): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
}

describe('chat store', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    clearToken()
    pinia = createPinia()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('登录后加载会话列表（仅包含我参与的会话）', async () => {
    await loginAsAdmin()
    const chat = useChatStore(pinia)

    const pending = chat.loadConversations()
    await flush()
    await pending

    expect(chat.conversations).toHaveLength(5)
    expect(chat.directConversations).toHaveLength(3)
    expect(chat.groupConversations).toHaveLength(2)
    expect(chat.totalUnread).toBe(6)
  })

  it('打开会话后加载消息，停留满足条件后清零未读', async () => {
    await loginAsAdmin()
    const chat = useChatStore(pinia)
    const load = chat.loadConversations()
    await flush()
    await load

    const open = chat.openConversation('c-101')
    await flush()
    await open

    expect(chat.activeConversation?.name).toBe('李思')
    expect(chat.messagesOf('c-101')).toHaveLength(3)
    // 仅打开不立即已读，由聊天视图停留 2 秒后调用 markActiveRead
    expect(chat.totalUnread).toBe(6)

    const markRead = chat.markActiveRead()
    await flush()
    await markRead
    expect(chat.totalUnread).toBe(5)
  })

  it('发送消息后对方自动回复（演示逻辑）', async () => {
    await loginAsAdmin()
    const chat = useChatStore(pinia)
    const load = chat.loadConversations()
    await flush()
    await load
    const open = chat.openConversation('c-101')
    await flush()
    await open

    const send = chat.sendMessage('周五的评审会材料我来准备')
    await flush(400)
    await send
    expect(chat.messagesOf('c-101')).toHaveLength(4)
    expect(chat.messagesOf('c-101')[3]?.senderId).toBe('u-001')

    // 演示回复在 2~2.8 秒后到达（含「正在输入」状态）
    await flush(4000)
    const messages = chat.messagesOf('c-101')
    expect(messages).toHaveLength(5)
    expect(messages[4]?.senderId).not.toBe('u-001')
  })

  it('同一条消息经 HTTP 响应与 SSE 事件重复到达时只追加一次', async () => {
    await loginAsAdmin()
    const chat = useChatStore(pinia)
    const load = chat.loadConversations()
    await flush()
    await load
    const open = chat.openConversation('c-101')
    await flush()
    await open

    const message = {
      id: 'm-duplicated',
      conversationId: 'c-101',
      senderId: 'u-001',
      content: '去重测试',
      type: 'text' as const,
      attachments: [],
      sentAt: new Date().toISOString(),
    }
    vi.spyOn(chatApi, 'sendMessage').mockResolvedValue(message)

    const first = chat.sendMessage('去重测试')
    await flush()
    await first
    const second = chat.sendMessage('去重测试')
    await flush()
    await second

    expect(
      chat.messagesOf('c-101').filter((item) => item.id === message.id),
    ).toHaveLength(1)
  })

  it('发起私聊复用已有会话；新的私聊与群聊按规则创建', async () => {
    await loginAsAdmin()
    const chat = useChatStore(pinia)
    const load = chat.loadConversations()
    await flush()
    await load

    // 与李思已有私聊：复用 c-101
    const existingPending = chat.ensureDirectConversation('u-002')
    await flush()
    const existing = await existingPending
    expect(existing.id).toBe('c-101')

    // 与孙悦无私聊：新建，名称取对方姓名
    const freshPending = chat.ensureDirectConversation('u-003')
    await flush()
    const fresh = await freshPending
    expect(fresh.type).toBe('direct')
    expect(fresh.name).toBe('孙悦')
    expect(fresh.participants).toHaveLength(2)

    // 群聊：自动命名，参与者含自己
    const groupPending = chat.createGroupConversation(['u-010', 'u-011', 'u-012'])
    await flush()
    const group = await groupPending
    expect(group.type).toBe('group')
    expect(group.name).toContain('赵强')
    expect(group.name).toContain('3 人')
    expect(group.participants).toHaveLength(4)
    expect(chat.conversations).toHaveLength(7)
  })
})
