<script setup lang="ts">
/**
 * 智能对话（AI 提问）。
 *
 * 与员工之间的「消息」完全独立：这里不展示员工会话，只承载用户与 AI 的问答。
 * 当前模型服务尚未接入，发送后会明确提示配置状态，而不是伪造 AI 回复。
 */
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/shared/components/Icon.vue'
import BaseButton from '@/shared/components/base/BaseButton.vue'
import BaseTextarea from '@/shared/components/base/BaseTextarea.vue'
import { useAuthStore } from '@/core/auth/store'

interface AiMessage {
  id: number
  role: 'user' | 'notice'
  content: string
}

const { t } = useI18n()
const auth = useAuthStore()

const draft = ref('')
const messages = ref<AiMessage[]>([])
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

function useSuggestion(value: string): void {
  draft.value = value
  void nextTick(() => composerRef.value?.focus())
}

function onSend(): void {
  const content = draft.value.trim()
  if (!content) return

  messages.value.push({ id: ++sequence, role: 'user', content })
  messages.value.push({
    id: ++sequence,
    role: 'notice',
    content: t('ai.notConfigured'),
  })
  draft.value = ''
  void nextTick(() => composerRef.value?.resize())
  scrollToBottom()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    onSend()
  }
}
</script>

<template>
  <div class="ai-chat">
    <header class="ai-chat__header">
      <span class="ai-chat__avatar"><Icon name="sparkles" :size="20" /></span>
      <div>
        <p class="ai-chat__title">{{ t('ai.title') }}</p>
        <p class="ai-chat__meta">{{ t('ai.subtitle') }}</p>
      </div>
    </header>

    <div ref="listRef" class="ai-chat__body">
      <section class="ai-chat__welcome">
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

      <div v-if="messages.length" class="ai-chat__messages">
        <div
          v-for="message in messages"
          :key="message.id"
          class="ai-msg"
          :class="`ai-msg--${message.role}`"
        >
          <div class="ai-msg__bubble">{{ message.content }}</div>
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
        <BaseButton variant="primary" :disabled="!draft.trim()" @click="onSend">
          <template #icon><Icon name="send" :size="15" /></template>
          {{ t('ai.send') }}
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

.ai-chat__messages {
  max-width: 820px;
  margin: var(--space-6) auto 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.ai-msg {
  display: flex;
}

.ai-msg--user {
  justify-content: flex-end;
}

.ai-msg__bubble {
  max-width: min(78%, 620px);
  padding: 10px 14px;
  border-radius: var(--radius-lg);
  font-size: var(--font-md);
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

.ai-msg--user .ai-msg__bubble {
  background: var(--color-primary);
  color: var(--color-primary-contrast);
}

.ai-msg--notice .ai-msg__bubble {
  background: var(--color-surface-2);
  border: 1px dashed var(--color-border-strong);
  color: var(--color-text-2);
  font-size: var(--font-sm);
}

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
