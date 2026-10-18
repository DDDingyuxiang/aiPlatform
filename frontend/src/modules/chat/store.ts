/**
 * 对话状态（Pinia）：会话列表、消息缓存与发送。
 * 活跃会话由路由参数驱动（openConversation 由视图在路由变化时调用）。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { appConfig } from '@/core/config'
import { useAuthStore } from '@/core/auth/store'
import { ApiError, http, type ServerSentEvent } from '@/core/http'
import { emitRealtimeEvent } from '@/core/realtime'
import { toast } from '@/shared/composables/useToast'
import { genId } from '@/shared/utils/id'
import { chatApi } from './api'
import { pickDemoReply } from './data'
import type { ChatMessageType, Conversation, Message } from './types'

interface RealtimeEnvelope {
  type: string
  payload: {
    conversationId?: string
    conversationName?: string
    message?: Message
    senderId?: string
    senderName?: string
    preview?: string
  }
}

export const useChatStore = defineStore('chat', () => {
  const conversations = ref<Conversation[]>([])
  const loaded = ref(false)
  const activeId = ref<string | null>(null)
  const messagesById = ref<Record<string, Message[]>>({})
  const typingByConversation = ref<Record<string, string | null>>({})
  const sending = ref(false)
  const uploading = ref(false)
  const realtimeConnected = ref(false)
  let realtimeController: AbortController | null = null

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

  async function loadConversations(force = false): Promise<void> {
    if (loaded.value && !force) return
    try {
      conversations.value = await chatApi.conversations()
      loaded.value = true
    } catch (error) {
      console.error('[chat] 会话列表加载失败', error)
    }
  }

  async function openConversation(conversationId: string): Promise<void> {
    activeId.value = conversationId

    // 打开只加载消息；“已读”由消息窗口可见满 2 秒后调用 markActiveRead 完成
    try {
      messagesById.value[conversationId] = await chatApi.messages(conversationId)
    } catch (error) {
      console.error('[chat] 消息加载失败', error)
      messagesById.value[conversationId] = []
    }
  }

  /** 当前可见会话满足停留条件后清零未读（由聊天视图的 2 秒计时器调用） */
  async function markActiveRead(): Promise<void> {
    const conversationId = activeId.value
    if (!conversationId) return

    const conversation = conversations.value.find((item) => item.id === conversationId)
    if (conversation) conversation.unread = 0

    try {
      await chatApi.markRead(conversationId)
    } catch (error) {
      console.warn('[chat] 未读数清零失败', error)
    }
  }

  function messagesOf(conversationId: string | null): Message[] {
    return conversationId ? (messagesById.value[conversationId] ?? []) : []
  }

  /** 会话列表预览文案：文本取正文，附件显示类型与文件名 */
  function previewOf(message: Message): string {
    const type: ChatMessageType = message.type
    if (type === 'image' || type === 'file') {
      const label = type === 'image' ? '[图片]' : '[文件]'
      const name = message.attachments.at(0)?.fileName
      return name ? `${label} ${name}` : label
    }
    return message.content
  }

  function applySentMessage(conversation: Conversation, message: Message): void {
    appendMessage(conversation.id, message)
    conversation.lastMessage = previewOf(message)
    conversation.updatedAt = message.sentAt
  }

  async function sendMessage(content: string): Promise<boolean> {
    const conversation = activeConversation.value
    const text = content.trim()
    if (!conversation || !text || sending.value) return false
    sending.value = true
    try {
      const message = await chatApi.sendMessage(conversation.id, { content: text })
      applySentMessage(conversation, message)
      if (appConfig.features.mockApi) scheduleDemoReply(conversation)
      return true
    } catch (error) {
      console.error('[chat] 消息发送失败', error)
      return false
    } finally {
      sending.value = false
    }
  }

  /** 发送文件/图片；caption 为随文件一起发送的文字说明 */
  async function sendAttachment(file: File, caption = ''): Promise<boolean> {
    const conversation = activeConversation.value
    if (!conversation || uploading.value) return false
    uploading.value = true
    try {
      const message = await chatApi.uploadAttachment(conversation.id, file, caption.trim() || undefined)
      applySentMessage(conversation, message)
      return true
    } catch (error) {
      console.error('[chat] 附件发送失败', error)
      return false
    } finally {
      uploading.value = false
    }
  }

  /** 轮询刷新当前会话：拉取最新消息并同步会话列表排序 */
  async function refreshActive(): Promise<void> {
    const conversationId = activeId.value
    if (!conversationId || sending.value || uploading.value) return
    try {
      const [latestConversations, messages] = await Promise.all([
        chatApi.conversations(),
        chatApi.messages(conversationId),
      ])
      conversations.value = latestConversations
      messagesById.value[conversationId] = messages
    } catch (error) {
      // 轮询失败不打扰用户，下次继续尝试
      console.warn('[chat] 会话刷新失败', error)
    }
  }

  /** 收到实时聊天消息：去重后追加，并更新会话预览/未读 */
  function applyIncomingMessage(payload: RealtimeEnvelope['payload']): void {
    const conversationId = payload.conversationId
    const message = payload.message
    if (!conversationId || !message) return

    const conversation = conversations.value.find((item) => item.id === conversationId)
    if (!conversation) {
      void loadConversations(true)
      return
    }

    const myId = useAuthStore().user?.id
    const list = messagesById.value[conversationId]
    if (list && !list.some((item) => item.id === message.id)) {
      list.push(message)
      messagesById.value[conversationId] = list
    }

    conversation.lastMessage = previewOf(message)
    conversation.updatedAt = message.sentAt

    // 系统消息（AI 任务通知）不产生未读
    if (message.type === 'system' || message.senderId === myId) return

    // 正在查看时由聊天视图在可见满 2 秒后统一标记已读；
    // 其他会话才累加本地未读徽标。
    if (conversation.id !== activeId.value) {
      conversation.unread += 1
    }
  }

  function applyNotification(payload: RealtimeEnvelope['payload']): void {
    const myId = useAuthStore().user?.id
    if (!payload.senderId || payload.senderId === myId) return
    if (payload.conversationId && payload.conversationId === activeId.value) return

    const title = payload.conversationName || payload.senderName || ''
    const preview = payload.preview || ''
    toast.info(preview ? `${title}：${preview}` : title)
  }

  function handleRealtimeEvent(event: ServerSentEvent): void {
    if (event.event === 'connected') {
      realtimeConnected.value = true
      // 重连后补齐断线期间的消息与会话排序
      void loadConversations(true)
      if (activeId.value) void openConversation(activeId.value)
      return
    }

    let envelope: RealtimeEnvelope
    try {
      envelope = JSON.parse(event.data) as RealtimeEnvelope
    } catch {
      return
    }

    // 分发给其他业务模块（例如任务模块监听 task.created）
    emitRealtimeEvent({ type: envelope.type, payload: envelope.payload })

    if (envelope.type === 'chat.message') applyIncomingMessage(envelope.payload)
    else if (envelope.type === 'notification') applyNotification(envelope.payload)
  }

  /** 建立 SSE 连接；断线后每 3 秒重连，直到主动断开或登录失效 */
  function connectRealtime(): void {
    // Mock 演示模式没有后端 SSE，避免无意义的连接重试
    if (appConfig.features.mockApi || realtimeController) return
    const controller = new AbortController()
    realtimeController = controller

    void (async () => {
      while (!controller.signal.aborted) {
        try {
          await http.sse('/chat/events', handleRealtimeEvent, {
            signal: controller.signal,
          })
        } catch (error) {
          if (controller.signal.aborted) break
          if (error instanceof ApiError && error.status === 401) break
          console.warn('[chat] 实时连接中断，稍后重试', error)
        }

        realtimeConnected.value = false
        if (controller.signal.aborted) break
        await new Promise((resolve) => setTimeout(resolve, 3_000))
      }
    })()
  }

  function disconnectRealtime(): void {
    realtimeController?.abort()
    realtimeController = null
    realtimeConnected.value = false
  }

  /** 离开聊天页时清除活跃会话，避免实时事件误判为“正在查看” */
  function closeConversation(): void {
    activeId.value = null
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
    // 发送方会同时收到 HTTP 响应与 SSE 事件，按消息 ID 去重，避免同一条消息展示两次
    if (list.some((item) => item.id === message.id)) return
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
          type: 'text',
          attachments: [],
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
    uploading,
    realtimeConnected,
    loadConversations,
    openConversation,
    markActiveRead,
    messagesOf,
    sendMessage,
    sendAttachment,
    refreshActive,
    connectRealtime,
    disconnectRealtime,
    closeConversation,
    ensureDirectConversation,
    createGroupConversation,
  }
})
