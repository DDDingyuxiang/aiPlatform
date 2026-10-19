/** 智能对话状态（Pinia）：服务端持久化会话、历史消息与滚动摘要 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { aiApi } from './api'
import type {
  AiConversation,
  AiConversationSummary,
  AiHistoryMessage,
  AiStreamEvent,
} from './types'

const ACTIVE_CONVERSATION_KEY = 'ai.activeConversationId'
const PAGE_SIZE = 50

function readStoredActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_CONVERSATION_KEY)
  } catch {
    return null
  }
}

function storeActiveId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_CONVERSATION_KEY, id)
    else localStorage.removeItem(ACTIVE_CONVERSATION_KEY)
  } catch {
    // 隐私模式等场景下 localStorage 可能不可用，忽略即可
  }
}

function createClientMessageId(): string {
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export const useAiChatStore = defineStore('aiChat', () => {
  const conversations = ref<AiConversation[]>([])
  const activeConversationId = ref<string | null>(null)
  const messages = ref<AiHistoryMessage[]>([])
  const summary = ref<AiConversationSummary | null>(null)
  const ownerEmployeeId = ref<string | null>(null)
  const initialized = ref(false)
  const loadingConversations = ref(false)
  const loadingMessages = ref(false)
  const loadingOlder = ref(false)
  const sending = ref(false)
  const streamingMessageId = ref<string | null>(null)
  const streamTick = ref(0)
  const hasMore = ref(false)
  const error = ref('')
  let activeController: AbortController | null = null
  let stopping = false

  const activeConversation = computed(
    () =>
      conversations.value.find(
        (conversation) => conversation.id === activeConversationId.value,
      ) ?? null,
  )

  function upsertConversation(conversation: AiConversation): void {
    const index = conversations.value.findIndex(
      (item) => item.id === conversation.id,
    )
    if (index >= 0) conversations.value.splice(index, 1, conversation)
    else conversations.value.unshift(conversation)
    conversations.value.sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    )
  }

  async function selectConversation(id: string | null): Promise<void> {
    if (sending.value) return
    activeConversationId.value = id
    storeActiveId(id)
    messages.value = []
    summary.value = null
    hasMore.value = false
    error.value = ''
    if (id) await loadMessages(id)
  }

  async function loadMessages(id: string, before?: string): Promise<void> {
    if (before ? loadingOlder.value : loadingMessages.value) return
    if (before) loadingOlder.value = true
    else loadingMessages.value = true
    error.value = ''
    try {
      const result = await aiApi.history(id, {
        limit: PAGE_SIZE,
        ...(before ? { before } : {}),
      })
      if (activeConversationId.value !== id) return
      messages.value = before
        ? [...result.messages, ...messages.value]
        : result.messages
      summary.value = result.summary
      hasMore.value = result.hasMore
      upsertConversation(result.conversation)
    } catch (caught) {
      if (activeConversationId.value === id) {
        error.value =
          caught instanceof Error ? caught.message : '对话历史加载失败'
      }
      console.error('[ai] 对话历史加载失败', caught)
    } finally {
      if (before) loadingOlder.value = false
      else loadingMessages.value = false
    }
  }

  function reset(): void {
    activeController?.abort()
    activeController = null
    stopping = false
    conversations.value = []
    activeConversationId.value = null
    messages.value = []
    summary.value = null
    hasMore.value = false
    error.value = ''
    sending.value = false
    streamingMessageId.value = null
    streamTick.value += 1
    initialized.value = false
  }

  async function initialize(employeeId?: string): Promise<void> {
    // 同一浏览器切换账号时不能复用上一个账号的会话列表
    if (initialized.value && ownerEmployeeId.value === (employeeId ?? null)) return
    if (initialized.value && ownerEmployeeId.value !== (employeeId ?? null)) {
      reset()
    }
    ownerEmployeeId.value = employeeId ?? null
    if (loadingConversations.value) return
    loadingConversations.value = true
    error.value = ''
    try {
      conversations.value = await aiApi.listConversations()
      const stored = readStoredActiveId()
      const target =
        stored && conversations.value.some((item) => item.id === stored)
          ? stored
          : (conversations.value[0]?.id ?? null)
      initialized.value = true
      await selectConversation(target)
    } catch (caught) {
      error.value =
        caught instanceof Error ? caught.message : '对话列表加载失败'
      console.error('[ai] 对话列表加载失败', caught)
    } finally {
      loadingConversations.value = false
    }
  }

  async function reloadConversations(): Promise<void> {
    try {
      conversations.value = await aiApi.listConversations()
    } catch (caught) {
      console.error('[ai] 对话列表刷新失败', caught)
    }
  }

  function startNewConversation(): void {
    if (sending.value) return
    activeConversationId.value = null
    storeActiveId(null)
    messages.value = []
    summary.value = null
    hasMore.value = false
    error.value = ''
  }

  function findStreamingMessage(): AiHistoryMessage | null {
    const id = streamingMessageId.value
    if (!id) return null
    return messages.value.find((message) => message.id === id) ?? null
  }

  function applyStreamEvent(
    event: AiStreamEvent,
    optimisticId: string,
    userContent: string,
  ): void {
    switch (event.type) {
      case 'meta': {
        const pendingIndex = messages.value.findIndex(
          (message) => message.id === optimisticId,
        )
        const pending = pendingIndex >= 0 ? messages.value[pendingIndex]! : null
        const userMessage: AiHistoryMessage = {
          id: event.userMessageId,
          role: 'user',
          content: pending?.content ?? userContent,
          sources: [],
          status: 'completed',
          createdAt: pending?.createdAt ?? new Date().toISOString(),
        }
        if (pendingIndex >= 0) messages.value.splice(pendingIndex, 1, userMessage)
        else messages.value.push(userMessage)
        if (
          !messages.value.some(
            (message) => message.id === event.assistantMessageId,
          )
        ) {
          messages.value.push({
            id: event.assistantMessageId,
            role: 'assistant',
            content: '',
            sources: [],
            status: 'streaming',
            createdAt: new Date().toISOString(),
          })
        }
        streamingMessageId.value = event.assistantMessageId
        break
      }
      case 'sources': {
        const message = findStreamingMessage()
        if (message) {
          message.sources = event.sources
          message.knowledgeStatus = event.status
        }
        break
      }
      case 'delta': {
        const message = findStreamingMessage()
        if (message) {
          message.content += event.content
          streamTick.value += 1
        }
        break
      }
      case 'done': {
        let message =
          messages.value.find(
            (item) => item.id === event.assistantMessageId,
          ) ?? null
        if (!message) {
          message = {
            id: event.assistantMessageId,
            role: 'assistant',
            content: event.content,
            sources: [],
            status: 'completed',
            createdAt: new Date().toISOString(),
          }
          messages.value.push(message)
        } else {
          message.content = event.content
          message.status = 'completed'
        }
        message.model = event.model
        message.knowledgeStatus = event.knowledgeStatus
        streamTick.value += 1
        streamingMessageId.value = null
        break
      }
      case 'error': {
        const targetId = event.assistantMessageId ?? streamingMessageId.value
        const index = targetId
          ? messages.value.findIndex((message) => message.id === targetId)
          : -1
        if (index >= 0) {
          const message = messages.value[index]!
          if (message.content.trim()) {
            message.status = 'failed'
          } else {
            messages.value.splice(index, 1)
          }
        }
        error.value = event.message
        streamingMessageId.value = null
        break
      }
    }
  }

  async function send(content: string): Promise<void> {
    const trimmed = content.trim()
    if (!trimmed || sending.value) return
    error.value = ''

    let conversationId = activeConversationId.value
    if (!conversationId) {
      try {
        const created = await aiApi.createConversation()
        upsertConversation(created)
        conversationId = created.id
        activeConversationId.value = created.id
        storeActiveId(created.id)
      } catch (caught) {
        error.value = caught instanceof Error ? caught.message : '新建对话失败'
        return
      }
    }

    const clientMessageId = createClientMessageId()
    const optimisticId = `pending-${clientMessageId}`
    messages.value.push({
      id: optimisticId,
      role: 'user',
      content: trimmed,
      sources: [],
      status: 'completed',
      createdAt: new Date().toISOString(),
    })

    const controller = new AbortController()
    activeController = controller
    stopping = false
    sending.value = true
    streamingMessageId.value = null
    streamTick.value += 1

    try {
      await aiApi.sendMessageStream(
        conversationId,
        { content: trimmed, clientMessageId },
        (event) => {
          if (activeConversationId.value !== conversationId) return
          applyStreamEvent(event, optimisticId, trimmed)
        },
        { signal: controller.signal },
      )

      if (stopping) {
        const message = findStreamingMessage()
        if (message) {
          if (message.content.trim()) message.status = 'interrupted'
          else {
            const index = messages.value.findIndex(
              (item) => item.id === message.id,
            )
            if (index >= 0) messages.value.splice(index, 1)
          }
        }
      } else {
        // 服务端异常关闭但没有 error 事件时，按中断处理
        const message = findStreamingMessage()
        if (message) message.status = 'interrupted'
      }
    } catch (caught) {
      if (!stopping) {
        error.value = caught instanceof Error ? caught.message : 'AI 服务暂不可用'
        const message = findStreamingMessage()
        if (message && message.content.trim()) message.status = 'failed'
        console.error('[ai] 流式发送失败', caught)
      }
    } finally {
      activeController = null
      streamingMessageId.value = null
      stopping = false
      sending.value = false
      void reloadConversations()
    }
  }

  function stopStreaming(): void {
    if (!sending.value || !activeController) return
    stopping = true
    activeController.abort()
  }

  async function loadOlder(): Promise<void> {
    const conversationId = activeConversationId.value
    const first = messages.value[0]
    if (!conversationId || !first || !hasMore.value || loadingOlder.value) return
    await loadMessages(conversationId, first.id)
  }

  async function deleteConversation(id: string): Promise<void> {
    if (sending.value) return
    try {
      await aiApi.deleteConversation(id)
      conversations.value = conversations.value.filter(
        (conversation) => conversation.id !== id,
      )
      if (activeConversationId.value === id) {
        const next = conversations.value[0]?.id ?? null
        await selectConversation(next)
      }
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : '删除对话失败'
      console.error('[ai] 删除对话失败', caught)
    }
  }

  return {
    conversations,
    activeConversationId,
    activeConversation,
    messages,
    summary,
    initialized,
    loadingConversations,
    loadingMessages,
    loadingOlder,
    sending,
    streamingMessageId,
    streamTick,
    hasMore,
    error,
    initialize,
    reloadConversations,
    selectConversation,
    startNewConversation,
    send,
    stopStreaming,
    loadOlder,
    deleteConversation,
  }
})
