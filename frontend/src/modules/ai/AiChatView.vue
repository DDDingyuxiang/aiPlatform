<script setup lang="ts">
/**
 * 智能对话（AI 提问）。
 *
 * 与员工之间的「消息」完全独立：这里只承载用户与 AI 的多轮问答。
 * 请求经业务后端转发到独立的 AI 服务（本地 Ollama），
 * 前端不直接访问模型，也不接触任何模型密钥。
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/shared/components/Icon.vue'
import BaseAvatar from '@/shared/components/base/BaseAvatar.vue'
import BaseButton from '@/shared/components/base/BaseButton.vue'
import BaseTextarea from '@/shared/components/base/BaseTextarea.vue'
import { useAuthStore } from '@/core/auth/store'
import { toast } from '@/shared/composables/useToast'
import { aiApi } from './api'

type UiRole = 'user' | 'assistant' | 'error'

interface UiMessage {
  id: number
  role: UiRole
  content: string
}

const { t } = useI18n()
const auth = useAuthStore()

const draft = ref('')
const messages = ref<UiMessage[]>([])
const sending = ref(false)
const listRef = ref<HTMLElement | null>(null)
const composerRef = ref<InstanceType<typeof BaseTextarea> | null>(null)
let sequence = 0

const suggestions = computed(() => [
  t('ai.suggestions.summary'),
  t('ai.suggestions.plan'),
  t('ai.suggestions.polish'),
])

function scrollToBottom(): void {
  void nextTick(() => {
    const element = listRef.value
    if (element) element.scrollTop = element.scrollHeight
  })
}

watch(
  () => [messages.value.length, sending.value],
  () => scrollToBottom(),
)

function useSuggestion(value: string): void {
  draft.value = value
  void nextTick(() => composerRef.value?.focus())
}

function clearConversation(): void {
  if (sending.value) return
  messages.value = []
  draft.value = ''
  void nextTick(() => composerRef.value?.focus())
}

async function onSend(): Promise<void> {
  const content = draft.value.trim()
  if (!content || sending.value) return

  messages.value.push({ id: ++sequence, role: 'user', content })
  draft.value = ''
  sending.value = true
  scrollToBottom()

  try {
    // 只发送最近 19 条历史，系统提示由后端统一补充
    const history = messages.value
      .filter((message) => message.role !== 'error')
      .slice(-19)
      .map((message) => ({
        role: message.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: message.content,
      }))

    const result = await aiApi.chat({ messages: history })
    messages.value.push({
      id: ++sequence,
      role: 'assistant',
      content: result.message.content,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : t('ai.failed')
    toast.error(message)
    messages.value.push({
      id: ++sequence,
      role: 'error',
      content: t('ai.failed'),
    })
  } finally {
    sending.value = false
    void nextTick(() => composerRef.value?.resize())
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    void onSend()
  }
}
</script>

<template>
  <div class="ai-chat">
    <header class="ai-chat__header">
      <span class="ai-chat__avatar"><Icon name="sparkles" :size="20" /></span>
      <div class="ai-chat__heading">
        <p class="ai-chat__title">{{ t('ai.title') }}</p>
        <p class="ai-chat__meta">{{ t('ai.subtitle') }}</p>
      </div>
      <BaseButton
        v-if="messages.length > 0"
        variant="ghost"
        size="sm"
        :disabled="sending"
        @click="clearConversation"
      >
        <template #icon><Icon name="refresh" :size="14" /></template>
        {{ t('ai.clear') }}
      </BaseButton>
    </header>

    <div ref="listRef" class="ai-chat__body">
      <section v-if="messages.length === 0" class="ai-chat__welcome">
        <span class="ai-chat__hero-icon"><Icon name="sparkles" :size="28" /></span>
        <h2 class="ai-chat__hero-title">
          {{ t('ai.greeting', { name: auth.user?.name ?? '' }) }}
        </h2>
        <p class="ai-chat__hero-desc">{{ t('ai.description') }}</p>

        <div class="ai-chat__suggestions">
          <button
            v-for="suggestion in suggestions"
            :key="suggestion"
            type="button"
            class="ai-chat__suggestion"
            @click="useSuggestion(suggestion)"
          >
            {{ suggestion }}
          </button>
        </div>
      </section>

      <div v-else class="ai-chat__messages">
        <div
          v-for="message in messages"
          :key="message.id"
          class="ai-msg"
          :class="`ai-msg--${message.role}`"
        >
          <BaseAvatar
            v-if="message.role === 'assistant'"
            :name="t('ai.title')"
            :size="30"
            class="ai-msg__avatar"
          />
          <span v-else-if="message.role === 'error'" class="ai-msg__error-icon">
            <Icon name="alert-circle" :size="18" />
          </span>
          <div class="ai-msg__bubble">{{ message.content }}</div>
        </div>

        <div v-if="sending" class="ai-msg ai-msg--assistant">
          <BaseAvatar :name="t('ai.title')" :size="30" class="ai-msg__avatar" />
          <div class="ai-msg__bubble ai-msg__bubble--thinking">
            {{ t('ai.thinking') }}
            <span class="ai-chat__dots" aria-hidden="true"><i /><i /><i /></span>
          </div>
        </div>
      </div>
    </div>

    <footer class="ai-chat__composer">
      <BaseTextarea
        ref="composerRef"
        v-model="draft"
        :placeholder="t('ai.placeholder')"
        :max-height-px="160"
        @keydown="onKeydown"
      />
      <div class="ai-chat__composer-bar">
        <span class="ai-chat__hint">{{ t('ai.hint') }}</span>
        <BaseButton
          variant="primary"
          :disabled="!draft.trim() || sending"
          :loading="sending"
          @click="onSend"
        >
          <template #icon><Icon name="send" :size="15" /></template>
          {{ sending ? t('ai.thinking') : t('ai.send') }}
        </BaseButton>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.ai-chat {
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--header-height));
}

.ai-chat__header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-5);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.ai-chat__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, var(--color-ai-1), var(--color-ai-2));
  color: #ffffff;
  box-shadow: var(--shadow-xs);
}

.ai-chat__heading {
  flex: 1;
  min-width: 0;
}

.ai-chat__title {
  font-size: var(--font-lg);
  font-weight: var(--weight-semibold);
  color: var(--color-text-1);
}

.ai-chat__meta {
  margin-top: 2px;
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

.ai-chat__body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-6) var(--space-5);
}

/* ---- 欢迎区 ---- */
.ai-chat__welcome {
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding-top: 6vh;
}

.ai-chat__hero-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: var(--radius-xl);
  background: var(--color-ai-soft);
  color: var(--color-ai-1);
  margin-bottom: var(--space-4);
}

.ai-chat__hero-title {
  font-size: var(--font-2xl);
  font-weight: var(--weight-semibold);
  color: var(--color-text-1);
}

.ai-chat__hero-desc {
  max-width: 520px;
  margin-top: var(--space-2);
  font-size: var(--font-sm);
  line-height: 1.7;
  color: var(--color-text-3);
}

.ai-chat__suggestions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-2);
  margin-top: var(--space-5);
}

.ai-chat__suggestion {
  padding: 8px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-surface);
  font-size: var(--font-sm);
  color: var(--color-text-2);
  transition:
    background-color var(--duration-fast) var(--ease-standard),
    border-color var(--duration-fast) var(--ease-standard);
}

.ai-chat__suggestion:hover {
  background: var(--color-ai-soft);
  border-color: transparent;
  color: var(--color-ai-1);
}

/* ---- 消息区 ---- */
.ai-chat__messages {
  max-width: 820px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.ai-msg {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
}

.ai-msg--user {
  justify-content: flex-end;
}

.ai-msg__avatar {
  margin-top: 2px;
  flex-shrink: 0;
}

.ai-msg__error-icon {
  display: inline-flex;
  margin-top: 6px;
  color: var(--color-danger-text);
}

.ai-msg__bubble {
  max-width: min(78%, 620px);
  padding: 10px 14px;
  border-radius: var(--radius-lg);
  font-size: var(--font-md);
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text-1);
}

.ai-msg--user .ai-msg__bubble {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-primary-contrast);
}

.ai-msg--error .ai-msg__bubble {
  background: var(--color-danger-soft);
  border-color: var(--color-danger);
  color: var(--color-danger-text);
  font-size: var(--font-sm);
}

.ai-msg__bubble--thinking {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--color-text-3);
  font-size: var(--font-sm);
}

.ai-chat__dots {
  display: inline-flex;
  gap: 3px;
}

.ai-chat__dots i {
  width: 4px;
  height: 4px;
  border-radius: var(--radius-full);
  background: var(--color-text-3);
  animation: ai-dot 1.2s infinite ease-in-out;
}

.ai-chat__dots i:nth-child(2) {
  animation-delay: 0.16s;
}

.ai-chat__dots i:nth-child(3) {
  animation-delay: 0.32s;
}

@keyframes ai-dot {
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
.ai-chat__composer {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5) var(--space-4);
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
}

.ai-chat__composer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.ai-chat__hint {
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

@media (max-width: 767px) {
  .ai-chat__header,
  .ai-chat__composer {
    padding-left: var(--space-4);
    padding-right: var(--space-4);
  }

  .ai-chat__hint {
    display: none;
  }
}
</style>
