<script setup lang="ts">
/**
 * 智能对话（AI 提问）。
 *
 * 与员工之间的「消息」完全独立：这里只承载用户与 AI 的多轮问答。
 * 会话与消息由业务后端持久化；本页负责会话列表、历史恢复与发送。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import Icon from '@/shared/components/Icon.vue'
import BaseAvatar from '@/shared/components/base/BaseAvatar.vue'
import BaseButton from '@/shared/components/base/BaseButton.vue'
import BaseTextarea from '@/shared/components/base/BaseTextarea.vue'
import { useAuthStore } from '@/core/auth/store'
import { toast } from '@/shared/composables/useToast'
import AiConversationList from './components/AiConversationList.vue'
import { useAiChatStore } from './store'
import type { AiChatSource, AiKnowledgeStatus } from './types'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()
const store = useAiChatStore()

const draft = ref('')
const sending = computed(() => store.sending)
const messages = computed(() => store.messages)
const summary = computed(() => store.summary)
const showSidebar = ref(false)
const listRef = ref<HTMLElement | null>(null)
const composerRef = ref<InstanceType<typeof BaseTextarea> | null>(null)

const suggestions = computed(() => [
  t('ai.suggestions.summary'),
  t('ai.suggestions.plan'),
  t('ai.suggestions.polish'),
])

const showWelcome = computed(
  () => messages.value.length === 0 && !store.loadingMessages,
)

/** 用户是否仍在消息底部附近；流式输出时避免打断向上阅读 */
function isNearBottom(): boolean {
  const element = listRef.value
  if (!element) return true
  return element.scrollHeight - element.scrollTop - element.clientHeight < 120
}

function scrollToBottom(force = false): void {
  if (!force && !isNearBottom()) return
  void nextTick(() => {
    const element = listRef.value
    if (element) element.scrollTop = element.scrollHeight
  })
}

watch(
  () => [messages.value.length, sending.value],
  () => scrollToBottom(true),
)

// 流式增量不改变消息条数，单独监听以滚动跟随
watch(
  () => store.streamTick,
  () => scrollToBottom(false),
)

onMounted(async () => {
  await store.initialize(auth.user?.employeeId)
  if (store.error) toast.error(store.error)
})

onBeforeUnmount(() => {
  store.stopStreaming()
})

function useSuggestion(value: string): void {
  draft.value = value
  void nextTick(() => composerRef.value?.focus())
}

function startNewConversation(): void {
  if (sending.value) return
  store.startNewConversation()
  draft.value = ''
  showSidebar.value = false
  void nextTick(() => composerRef.value?.focus())
}

async function selectConversation(id: string): Promise<void> {
  if (sending.value) return
  showSidebar.value = false
  await store.selectConversation(id)
}

async function removeConversation(id: string): Promise<void> {
  await store.deleteConversation(id)
  if (store.error) toast.error(store.error)
}

async function onSend(): Promise<void> {
  const content = draft.value.trim()
  if (!content || sending.value) return
  draft.value = ''
  await store.send(content)
  if (store.error) toast.error(store.error)
  scrollToBottom()
  void nextTick(() => composerRef.value?.resize())
}

async function loadOlder(): Promise<void> {
  await store.loadOlder()
}

function stopGeneration(): void {
  if (!sending.value) return
  store.stopStreaming()
  toast.info(t('ai.stopped'))
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    void onSend()
  }
}

function openSource(source: AiChatSource): void {
  void router.push({ path: '/knowledge', query: { doc: source.documentId } })
}

function knowledgeStatusText(status?: AiKnowledgeStatus): string {
  switch (status) {
    case 'used':
      return t('ai.knowledge.used')
    case 'empty':
      return t('ai.knowledge.empty')
    case 'unavailable':
      return t('ai.knowledge.unavailable')
    case 'disabled':
      return t('ai.knowledge.disabled')
    default:
      return ''
  }
}
</script>

<template>
  <div class="ai-chat">
    <header class="ai-chat__header">
      <button
        type="button"
        class="ai-chat__sidebar-toggle"
        :title="t('ai.conversations')"
        @click="showSidebar = !showSidebar"
      >
        <Icon name="menu" :size="18" />
      </button>
      <span class="ai-chat__avatar"><Icon name="sparkles" :size="20" /></span>
      <div class="ai-chat__heading">
        <p class="ai-chat__title">{{ t('ai.title') }}</p>
        <p class="ai-chat__meta">
          {{ store.activeConversation?.title ?? t('ai.subtitle') }}
        </p>
      </div>
      <BaseButton
        variant="ghost"
        size="sm"
        :disabled="sending"
        @click="startNewConversation"
      >
        <template #icon><Icon name="plus" :size="14" /></template>
        {{ t('ai.newChat') }}
      </BaseButton>
    </header>

    <div class="ai-chat__main">
      <div
        v-if="showSidebar"
        class="ai-chat__overlay"
        @click="showSidebar = false"
      />
      <div
        class="ai-chat__sidebar"
        :class="{ 'ai-chat__sidebar--open': showSidebar }"
      >
        <AiConversationList
          :conversations="store.conversations"
          :active-id="store.activeConversationId"
          :disabled="sending"
          @select="selectConversation"
          @create="startNewConversation"
          @delete="removeConversation"
        />
      </div>

      <div class="ai-chat__panel">
        <div ref="listRef" class="ai-chat__body">
          <section v-if="showWelcome" class="ai-chat__welcome">
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
            <p v-if="store.loadingMessages" class="ai-chat__loading">
              {{ t('ai.loading') }}
            </p>
            <BaseButton
              v-if="store.hasMore"
              variant="ghost"
              size="sm"
              :loading="store.loadingOlder"
              class="ai-chat__load-older"
              @click="loadOlder"
            >
              <template #icon><Icon name="expand" :size="14" /></template>
              {{ t('ai.loadOlder') }}
            </BaseButton>

            <details v-if="summary" class="ai-chat__summary">
              <summary>
                <Icon name="summary" :size="14" />
                {{ t('ai.summaryTitle') }}
              </summary>
              <p class="ai-chat__summary-text">{{ summary.content }}</p>
              <p class="ai-chat__summary-hint">{{ t('ai.summaryHint') }}</p>
            </details>

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
              <div class="ai-msg__bubble">
                <span class="ai-msg__text">{{ message.content }}</span>
                <span
                  v-if="message.id === store.streamingMessageId"
                  class="ai-msg__cursor"
                  aria-hidden="true"
                />
                <span
                  v-if="message.role === 'assistant' && message.status === 'interrupted'"
                  class="ai-msg__status"
                >
                  {{ t('ai.interrupted') }}
                </span>
                <div
                  v-if="
                    message.role === 'assistant' &&
                    message.knowledgeStatus &&
                    message.knowledgeStatus !== 'unknown'
                  "
                  class="ai-msg__knowledge"
                  :class="{
                    'ai-msg__knowledge--warning':
                      message.knowledgeStatus === 'unavailable',
                    'ai-msg__knowledge--used':
                      message.knowledgeStatus === 'used',
                  }"
                >
                  <Icon
                    :name="
                      message.knowledgeStatus === 'unavailable'
                        ? 'alert-triangle'
                        : 'knowledge'
                    "
                    :size="13"
                  />
                  <span>{{ knowledgeStatusText(message.knowledgeStatus) }}</span>
                </div>
                <div v-if="message.sources?.length" class="ai-msg__sources">
                  <span class="ai-msg__sources-label">
                    <Icon name="knowledge" :size="13" />
                    {{ t('ai.sources') }}
                  </span>
                  <button
                    v-for="source in message.sources"
                    :key="source.documentId"
                    type="button"
                    class="ai-msg__source"
                    :title="source.excerpt"
                    @click="openSource(source)"
                  >
                    {{ source.title }}
                  </button>
                </div>
              </div>
            </div>

            <div v-if="sending && !store.streamingMessageId" class="ai-msg ai-msg--assistant">
              <BaseAvatar :name="t('ai.title')" :size="30" class="ai-msg__avatar" />
              <div class="ai-msg__bubble ai-msg__bubble--thinking">
                {{ t('ai.thinking') }}
                <span class="ai-chat__dots" aria-hidden="true"><i /><i /><i /></span>
              </div>
            </div>

            <div v-if="store.error" class="ai-msg ai-msg--error">
              <span class="ai-msg__error-icon">
                <Icon name="alert-circle" :size="18" />
              </span>
              <div class="ai-msg__bubble">{{ store.error }}</div>
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
              v-if="sending"
              variant="danger"
              @click="stopGeneration"
            >
              <template #icon><Icon name="close" :size="15" /></template>
              {{ t('ai.stop') }}
            </BaseButton>
            <BaseButton
              v-else
              variant="primary"
              :disabled="!draft.trim()"
              @click="onSend"
            >
              <template #icon><Icon name="send" :size="15" /></template>
              {{ t('ai.send') }}
            </BaseButton>
          </div>
        </footer>
      </div>
    </div>
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

.ai-chat__sidebar-toggle {
  display: none;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-md);
  color: var(--color-text-2);
}

.ai-chat__sidebar-toggle:hover {
  background: var(--color-ai-soft);
  color: var(--color-ai-1);
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ai-chat__main {
  flex: 1;
  display: flex;
  min-height: 0;
  position: relative;
}

.ai-chat__sidebar {
  display: flex;
  min-height: 0;
}

.ai-chat__overlay {
  display: none;
}

.ai-chat__panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
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

.ai-chat__load-older {
  align-self: center;
}

.ai-chat__loading {
  text-align: center;
  font-size: var(--font-sm);
  color: var(--color-text-3);
}

.ai-chat__summary {
  padding: var(--space-3) var(--space-4);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-ai-soft);
  color: var(--color-text-2);
}

.ai-chat__summary summary {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: var(--font-sm);
  font-weight: var(--weight-medium);
  color: var(--color-primary-text);
}

.ai-chat__summary-text {
  margin-top: var(--space-2);
  font-size: var(--font-sm);
  line-height: 1.7;
  white-space: pre-wrap;
}

.ai-chat__summary-hint {
  margin-top: var(--space-2);
  font-size: var(--font-xs);
  color: var(--color-text-3);
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

.ai-msg__status {
  display: block;
  margin-top: 6px;
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

.ai-msg__knowledge {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  font-size: var(--font-xs);
  line-height: 1.5;
  color: var(--color-text-3);
}

.ai-msg__knowledge--used {
  color: var(--color-primary-text);
}

.ai-msg__knowledge--warning {
  color: var(--color-warning-text);
}

.ai-msg__cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  margin-left: 2px;
  vertical-align: -2px;
  background: var(--color-ai-1);
  animation: ai-cursor 1s steps(1) infinite;
}

@keyframes ai-cursor {
  50% {
    opacity: 0;
  }
}

.ai-msg__bubble--thinking {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--color-text-3);
  font-size: var(--font-sm);
}

.ai-msg__sources {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed var(--color-border);
  white-space: normal;
}

.ai-msg__sources-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

.ai-msg__source {
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--color-ai-soft);
  color: var(--color-primary-text);
  font-size: var(--font-xs);
  transition: background-color var(--duration-fast) var(--ease-standard);
}

.ai-msg__source:hover {
  background: var(--color-primary-soft);
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

  .ai-chat__sidebar-toggle {
    display: inline-flex;
  }

  .ai-chat__sidebar {
    display: none;
  }

  .ai-chat__sidebar--open {
    display: flex;
    position: absolute;
    inset: 0 auto 0 0;
    z-index: 20;
  }

  .ai-chat__overlay {
    display: block;
    position: absolute;
    inset: 0;
    z-index: 10;
    background: rgb(0 0 0 / 30%);
  }

  .ai-chat__body {
    padding: var(--space-4);
  }

  .ai-msg__bubble {
    max-width: 86%;
  }
}
</style>
