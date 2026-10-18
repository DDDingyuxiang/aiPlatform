<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Icon from '@/shared/components/Icon.vue'
import BaseAvatar from '@/shared/components/base/BaseAvatar.vue'
import BaseButton from '@/shared/components/base/BaseButton.vue'
import BaseTag from '@/shared/components/base/BaseTag.vue'
import BaseTextarea from '@/shared/components/base/BaseTextarea.vue'
import MessageBubble from './components/MessageBubble.vue'

import { useAuthStore } from '@/core/auth/store'
import { toast } from '@/shared/composables/useToast'
import { useChatStore } from './store'
import type { Message } from './types'

const { t } = useI18n()
const route = useRoute()
const auth = useAuthStore()
const chat = useChatStore()

const draft = ref('')
const listRef = ref<HTMLElement | null>(null)
const composerRef = ref<InstanceType<typeof BaseTextarea> | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
let refreshTimer: number | undefined

const conversationId = computed(() =>
  typeof route.params.conversationId === 'string' ? route.params.conversationId : null,
)
const conversation = computed(() =>
  conversationId.value
    ? (chat.conversations.find((item) => item.id === conversationId.value) ?? null)
    : null,
)
const messages = computed(() => chat.messagesOf(conversationId.value))
const typingName = computed(() =>
  conversationId.value ? (chat.typingByConversation[conversationId.value] ?? null) : null,
)

watch(
  conversationId,
  async (id) => {
    if (!id) return
    // 直接刷新 /messages/:id 时，会话列表可能尚未加载
    await chat.loadConversations()
    await chat.openConversation(id)
  },
  { immediate: true },
)

watch(
  () => [messages.value.length, typingName.value],
  () => scrollToBottom(),
)

/** 首期用轮询同步新消息；后续接入 WebSocket/SSE 后移除 */
onMounted(() => {
  refreshTimer = window.setInterval(() => {
    if (!document.hidden) void chat.refreshActive()
  }, 5000)
})

onBeforeUnmount(() => {
  if (refreshTimer !== undefined) window.clearInterval(refreshTimer)
})

function scrollToBottom(): void {
  void nextTick(() => {
    const element = listRef.value
    if (element) element.scrollTop = element.scrollHeight
  })
}

function senderNameOf(message: Message): string {
  if (message.senderId === auth.user?.id) return t('chat.me')
  return (
    conversation.value?.participants.find((participant) => participant.id === message.senderId)
      ?.name ?? ''
  )
}

async function onSend(): Promise<void> {
  const text = draft.value.trim()
  if (!text) return
  const ok = await chat.sendMessage(text)
  if (ok) {
    draft.value = ''
    void nextTick(() => composerRef.value?.resize())
  } else {
    toast.error(t('chat.sendFailed'))
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    void onSend()
  }
}

function pickFile(): void {
  fileInputRef.value?.click()
}

async function onFileSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const ok = await chat.sendAttachment(file, draft.value)
  if (ok) {
    draft.value = ''
    void nextTick(() => composerRef.value?.resize())
  } else {
    toast.error(t('chat.sendFileFailed'))
  }
  input.value = ''
}
</script>

<template>
  <div class="chat">
    <!-- 未选择会话 -->
    <div v-if="!conversation" class="chat__empty">
      <span class="chat__empty-icon"><Icon name="chat" :size="30" /></span>
      <h2 class="chat__empty-title">{{ t('chat.empty.title') }}</h2>
      <p class="chat__empty-desc">{{ t('chat.empty.desc') }}</p>
    </div>

    <!-- 会话视图 -->
    <template v-else>
      <header class="chat__header">
        <BaseAvatar
          :name="conversation.name"
          :size="36"
          :shape="conversation.type === 'group' ? 'square' : 'circle'"
        />
        <div class="chat__title-area">
          <p class="chat__name">{{ conversation.name }}</p>
          <p class="chat__meta">
            <BaseTag :tone="conversation.type === 'group' ? 'primary' : 'neutral'">
              {{ t(`chat.type.${conversation.type}`) }}
            </BaseTag>
            <span>{{ t('chat.memberCount', { count: conversation.participants.length }) }}</span>
          </p>
        </div>
      </header>

      <div ref="listRef" class="chat__messages">
        <MessageBubble
          v-for="message in messages"
          :key="message.id"
          :message="message"
          :conversation="conversation"
          :mine="message.senderId === auth.user?.id"
          :sender-name="senderNameOf(message)"
        />
        <p v-if="typingName" class="chat__typing">
          {{ t('chat.typing', { name: typingName }) }}
          <span class="chat__dots" aria-hidden="true"><i /><i /><i /></span>
        </p>
      </div>

      <footer class="chat__composer">
        <BaseTextarea
          ref="composerRef"
          v-model="draft"
          :placeholder="t('chat.composer.placeholder')"
          :max-height-px="140"
          @keydown="onKeydown"
        />
        <div class="chat__composer-bar">
          <div class="chat__composer-tools">
            <input
              ref="fileInputRef"
              class="chat__file-input"
              type="file"
              @change="onFileSelected"
            />
            <BaseButton
              variant="ghost"
              size="sm"
              icon-only
              :disabled="chat.sending || chat.uploading"
              :loading="chat.uploading"
              :aria-label="t('chat.composer.attach')"
              :title="t('chat.composer.attach')"
              @click="pickFile"
            >
              <template #icon><Icon name="paperclip" :size="16" /></template>
            </BaseButton>
            <span class="chat__hint">{{ t('chat.composer.hint') }}</span>
          </div>
          <BaseButton
            variant="primary"
            :disabled="!draft.trim()"
            :loading="chat.sending"
            @click="onSend"
          >
            <template #icon><Icon name="send" :size="15" /></template>
            {{ t('chat.composer.send') }}
          </BaseButton>
        </div>
      </footer>
    </template>
  </div>
</template>

<style scoped>
.chat {
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--header-height));
}

/* ---- 空状态 ---- */
.chat__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-6);
  text-align: center;
}

.chat__empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 68px;
  height: 68px;
  margin-bottom: var(--space-2);
  border-radius: var(--radius-xl);
  background: var(--color-ai-soft);
  color: var(--color-ai-1);
}

.chat__empty-title {
  font-size: var(--font-xl);
  font-weight: var(--weight-semibold);
  color: var(--color-text-1);
}

.chat__empty-desc {
  max-width: 360px;
  font-size: var(--font-sm);
  color: var(--color-text-3);
}

/* ---- 会话头部 ---- */
.chat__header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-5);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.chat__name {
  font-size: var(--font-lg);
  font-weight: var(--weight-semibold);
  color: var(--color-text-1);
}

.chat__meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: 3px;
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

/* ---- 消息区 ---- */
.chat__messages {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5);
}

.chat__typing {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-xs);
  color: var(--color-text-3);
  padding-left: 40px;
}

.chat__dots {
  display: inline-flex;
  gap: 3px;
}

.chat__dots i {
  width: 4px;
  height: 4px;
  border-radius: var(--radius-full);
  background: var(--color-text-3);
  animation: chat-dot 1.2s infinite ease-in-out;
}

.chat__dots i:nth-child(2) {
  animation-delay: 0.16s;
}

.chat__dots i:nth-child(3) {
  animation-delay: 0.32s;
}

@keyframes chat-dot {
  0%,
  60%,
  100% {
    opacity: 0.3;
    transform: translateY(0);
  }
  30% {
    opacity: 1;
    transform: translateY(-2px);
  }
}

/* ---- 输入区 ---- */
.chat__composer {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5) var(--space-4);
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
}

.chat__composer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.chat__composer-tools {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.chat__file-input {
  display: none;
}

.chat__hint {
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

@media (max-width: 767px) {
  .chat__header {
    padding: var(--space-2) var(--space-4);
  }

  .chat__messages {
    padding: var(--space-4);
  }

  .chat__composer {
    padding: var(--space-3) var(--space-4);
  }

  .chat__hint {
    display: none;
  }
}
</style>
