/**
 * 对话接口的 Mock 实现（演示数据，后端 conversations 模块就绪后整体删除）。
 * 会话列表与消息为模块级可变状态：本次会话内新建的群聊/发出的消息在刷新前保留。
 */
import { defineMock, fail } from '@/core/http'
import { findMockUserId } from '@/core/auth/mock'
import { MEMBERS } from '@/modules/identity'
import { DEMO_CONVERSATIONS, DEMO_MESSAGES } from './data'
import type { Conversation, CreateConversationPayload, Message, SendMessagePayload } from './types'

const conversations: Conversation[] = DEMO_CONVERSATIONS.map((item) => ({
  ...item,
  participants: [...item.participants],
}))

const messagesByConversation = new Map<string, Message[]>(
  Object.entries(DEMO_MESSAGES).map(([id, list]) => [id, list.map((message) => ({ ...message }))]),
)

function memberName(id: string): string {
  return MEMBERS.find((member) => member.id === id)?.name ?? id
}

function requireUserId(token: string | null): string | null {
  return findMockUserId(token)
}

/** 群聊自动命名：不超过两人直接连接，否则「甲、乙等 N 人的群聊」 */
function autoGroupName(names: string[]): string {
  if (names.length <= 2) return names.join('、')
  return `${names.slice(0, 2).join('、')}等 ${names.length} 人群聊`
}

defineMock(
  'GET',
  '/chat/conversations',
  ({ token }) => {
    const userId = requireUserId(token)
    if (!userId) return fail(40100, '登录状态已失效', 401)
    return conversations
      .filter((conversation) =>
        conversation.participants.some((participant) => participant.id === userId),
      )
      .map((conversation) => ({ ...conversation, participants: [...conversation.participants] }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },
  { delayMs: 250 },
)

defineMock('GET', '/chat/conversations/:id/messages', ({ params, token }) => {
  if (!requireUserId(token)) return fail(40100, '登录状态已失效', 401)
  const conversationId = params.id
  if (!conversationId) return fail(40401, '会话不存在', 404)
  const messages = messagesByConversation.get(conversationId)
  if (!messages) return fail(40401, '会话不存在', 404)
  return messages.map((message) => ({ ...message }))
})

defineMock('POST', '/chat/conversations', ({ body, token }) => {
  const userId = requireUserId(token)
  if (!userId) return fail(40100, '登录状态已失效', 401)
  const payload = body as CreateConversationPayload | undefined
  const memberIds = [...new Set(payload?.memberIds ?? [])].filter((id) => id !== userId)
  if (memberIds.length === 0) return fail(40002, '至少选择一位成员', 400)

  // 私聊复用已有会话（后端同样按参与者去重）
  const [singleTarget] = memberIds
  if (singleTarget !== undefined && memberIds.length === 1) {
    const existing = conversations.find(
      (conversation) =>
        conversation.type === 'direct' &&
        conversation.participants.length === 2 &&
        conversation.participants.some((participant) => participant.id === userId) &&
        conversation.participants.some((participant) => participant.id === singleTarget),
    )
    if (existing) return { ...existing, participants: [...existing.participants] }
  }

  const isGroup = memberIds.length > 1
  const names = memberIds.map(memberName)
  const conversation: Conversation = {
    id: `c-${Date.now()}`,
    type: isGroup ? 'group' : 'direct',
    name: isGroup ? autoGroupName(names) : (names[0] ?? singleTarget ?? ''),
    participants: [
      { id: userId, name: memberName(userId) },
      ...memberIds.map((id) => ({ id, name: memberName(id) })),
    ],
    unread: 0,
    updatedAt: new Date().toISOString(),
    lastMessage: '',
  }
  conversations.push(conversation)
  messagesByConversation.set(conversation.id, [])
  return { ...conversation, participants: [...conversation.participants] }
})

defineMock('POST', '/chat/conversations/:id/read', ({ params, token }) => {
  const userId = requireUserId(token)
  if (!userId) return fail(40100, '登录状态已失效', 401)
  const conversation = conversations.find((item) => item.id === params.id)
  if (!conversation) return fail(40401, '会话不存在', 404)
  conversation.unread = 0
  return { ok: true }
})

defineMock('POST', '/chat/conversations/:id/messages', ({ params, body, token }) => {
  const userId = requireUserId(token)
  if (!userId) return fail(40100, '登录状态已失效', 401)
  const conversation = conversations.find((item) => item.id === params.id)
  if (!conversation) return fail(40401, '会话不存在', 404)
  const payload = body as SendMessagePayload | undefined
  const content = payload?.content?.trim()
  if (!content) return fail(40003, '消息内容不能为空', 400)

  const message: Message = {
    id: `m-${Date.now()}`,
    conversationId: conversation.id,
    senderId: userId,
    type: 'text',
    attachments: [],
    content,
    sentAt: new Date().toISOString(),
  }
  const messages = messagesByConversation.get(conversation.id) ?? []
  messages.push(message)
  messagesByConversation.set(conversation.id, messages)
  conversation.lastMessage = content
  conversation.updatedAt = message.sentAt
  return { ...message }
})
