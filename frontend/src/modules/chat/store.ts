/**
 * 对话状态（Pinia）：会话列表、消息缓存与发送。
 * 活跃会话由路由参数驱动（openConversation 由视图在路由变化时调用）。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from '@/core/auth/store'
import { genId } from '@/shared/utils/id'
import { chatApi } from './api'
import { pickDemoReply } from './data'
import type { Conversation, Message } from './types'

export const useChatStore = defineStore('chat', () => {
  const conversations = ref<Conversation[]>([])
  const loaded = ref(false)
  const activeId = ref<string | null>(null)
  const messagesById = ref<Record<string, Message[]>>({})
  const typingByConversation = ref<Record<string, string | null>>({})
  const sending = ref(false)

  const sortedConversations = computed(() =>
    [...conversations.value].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  )
  const directConversations = computed(() =>
    sortedConversations.value.filter((conversation) => conversation.type === 'direct'),
  )
  const groupConversations = computed(() =>
    sortedConversations.value.filter((conversation) => conversation.type === 'group'),
  )
  const totalUnread = computed(() =>
    conversations.value.reduce((sum, conversation) => sum + conversation.unread, 0),
  )
  const activeConversation = computed(
    () => conversations.value.find((conversation) => conversation.id === activeId.value) ?? null,
  )

  async function loadConversations(): Promise<void> {
    if (loaded.value) return
    try {
      conversations.value = await chatApi.conversations()
      loaded.value = true
    } catch (error) {
      console.error('[chat] 会话列表加载失败', error)
    }
  }

  async function openConversation(conversationId: string): Promise<void> {
    activeId.value = conversationId
    const conversation = conversations.value.find((item) => item.id === conversationId)
    if (conversation) conversation.unread = 0
    if (!messagesById.value[conversationId]) {
      try {
        messagesById.value[conversationId] = await chatApi.messages(conversationId)
      } catch (error) {
        console.error('[chat] 消息加载失败', error)
        messagesById.value[conversationId] = []
      }
    }
  }

  function messagesOf(conversationId: string | null): Message[] {
    return conversationId ? (messagesById.value[conversationId] ?? []) : []
  }

  async function sendMessage(content: string): Promise<boolean> {
    const conversation = activeConversation.value
    const text = content.trim()
    if (!conversation || !text || sending.value) return false
    sending.value = true
    try {
      const message = await chatApi.sendMessage(conversation.id, { content: text })
      appendMessage(conversation.id, message)
      conversation.lastMessage = text
      conversation.updatedAt = message.sentAt
      scheduleDemoReply(conversation)
      return true
    } catch (error) {
      console.error('[chat] 消息发送失败', error)
      return false
    } finally {
      sending.value = false
    }
  }

  /** 发起（或复用已有）私聊；会话已存在时由 Mock/后端去重 */
  async function ensureDirectConversation(memberId: string): Promise<Conversation> {
    const conversation = await chatApi.createConversation({ memberIds: [memberId] })
    upsertConversation(conversation)
    return conversation
  }

  async function createGroupConversation(memberIds: string[]): Promise<Conversation> {
    const conversation = await chatApi.createConversation({ memberIds })
    upsertConversation(conversation)
    return conversation
  }

  function appendMessage(conversationId: string, message: Message): void {
    const list = messagesById.value[conversationId] ?? []
    list.push(message)
    messagesById.value[conversationId] = list
  }

  function upsertConversation(conversation: Conversation): void {
    const index = conversations.value.findIndex((item) => item.id === conversation.id)
    if (index === -1) conversations.value.push(conversation)
    else conversations.value[index] = conversation
  }

  /**
   * 演示期逻辑：模拟对方在 1~2 秒后回复（含「正在输入」状态）。
   * 真实环境由消息推送替代，本函数将连同 mock 层一起删除。
   */
  function scheduleDemoReply(conversation: Conversation): void {
    const myId = useAuthStore().user?.id
    const others = conversation.participants.filter((participant) => participant.id !== myId)
    if (others.length === 0) return
    const replier = others[Math.floor(Math.random() * others.length)]
    if (!replier) return

    window.setTimeout(() => {
      typingByConversation.value[conversation.id] = replier.name
    }, 500 + Math.random() * 600)

    window.setTimeout(
      () => {
        typingByConversation.value[conversation.id] = null
        const reply: Message = {
          id: genId('m'),
          conversationId: conversation.id,
          senderId: replier.id,
          content: pickDemoReply(),
          sentAt: new Date().toISOString(),
        }
        appendMessage(conversation.id, reply)
        conversation.lastMessage = reply.content
        conversation.updatedAt = reply.sentAt
        if (conversation.id !== activeId.value) conversation.unread += 1
      },
      2000 + Math.random() * 800,
    )
  }

  return {
    conversations,
    loaded,
    activeId,
    activeConversation,
    sortedConversations,
    directConversations,
    groupConversations,
    totalUnread,
    typingByConversation,
    sending,
    loadConversations,
    openConversation,
    messagesOf,
    sendMessage,
    ensureDirectConversation,
    createGroupConversation,
  }
})
