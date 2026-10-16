<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/shared/components/Icon.vue'
import BaseButton from '@/shared/components/base/BaseButton.vue'
import BaseModal from '@/shared/components/base/BaseModal.vue'
import BaseTag from '@/shared/components/base/BaseTag.vue'
import BaseTextarea from '@/shared/components/base/BaseTextarea.vue'
import { useAuthStore } from '@/core/auth/store'
import { toast } from '@/shared/composables/useToast'
import { genId } from '@/shared/utils/id'
import { useWorkflowsStore } from '../store'
import {
  FIELDS_BY_TYPE,
  TYPE_LABEL,
  amountCentFromText,
  buildTitle,
  detectType,
  type BuilderFieldDef,
} from '../builder'
import type { ApprovalField, ApprovalType } from '../types'

const props = defineProps<{ open: boolean; presetType?: ApprovalType | null }>()
const emit = defineEmits<{ close: []; submitted: [] }>()

const { t, tm } = useI18n()
const auth = useAuthStore()
const workflows = useWorkflowsStore()

interface ChatMessage {
  id: string
  role: 'ai' | 'user'
  text: string
}

type Phase = 'collect-type' | 'collect-fields' | 'confirm'

const messages = ref<ChatMessage[]>([])
const phase = ref<Phase>('collect-type')
const draft = reactive<Record<string, string>>({})
const fieldQueue = ref<BuilderFieldDef[]>([])
const fieldIndex = ref(0)
const detectedType = ref<ApprovalType | null>(null)
const input = ref('')
const awaiting = ref(false)
const submitting = ref(false)
const scrollRef = ref<HTMLElement | null>(null)
const inputRef = ref<InstanceType<typeof BaseTextarea> | null>(null)

let replyTimer: number | undefined

const examplePrompts = computed(() => tm('ops.workflows.create.examples') as string[])

const canSend = computed(
  () => !!input.value.trim() && !awaiting.value && phase.value !== 'confirm',
)

const previewFields = computed<ApprovalField[]>(() =>
  detectedType.value
    ? FIELDS_BY_TYPE[detectedType.value].map((def) => ({
        key: def.key,
        label: def.label,
        value: draft[def.key] ?? '—',
      }))
    : [],
)

const previewAmountCent = computed(() =>
  draft.amount ? amountCentFromText(draft.amount) : undefined,
)

function scrollToBottom(): void {
  void nextTick(() => {
    const element = scrollRef.value
    if (element) element.scrollTop = element.scrollHeight
  })
}

function pushMessage(role: ChatMessage['role'], text: string): void {
  messages.value.push({ id: genId('msg'), role, text })
  scrollToBottom()
}

/** 模拟助手思考延迟（演示体验；真实环境由 AI 能力层响应） */
function aiReply(text: string, delay = 420): void {
  awaiting.value = true
  scrollToBottom()
  replyTimer = window.setTimeout(() => {
    pushMessage('ai', text)
    awaiting.value = false
    void nextTick(() => inputRef.value?.focus())
  }, delay)
}

function resetState(): void {
  messages.value = []
  phase.value = 'collect-type'
  detectedType.value = null
  fieldQueue.value = []
  fieldIndex.value = 0
  input.value = ''
  awaiting.value = false
  for (const key of Object.keys(draft)) delete draft[key]
}

function startFresh(): void {
  resetState()
  pushMessage('ai', t('ops.workflows.create.greeting'))
}

function beginType(type: ApprovalType): void {
  detectedType.value = type
  fieldQueue.value = FIELDS_BY_TYPE[type]
  fieldIndex.value = 0
  phase.value = 'collect-fields'
  const firstQuestion = fieldQueue.value[0]?.question ?? ''
  aiReply(`${t('ops.workflows.create.recognized', { type: TYPE_LABEL[type] })}\n${firstQuestion}`, 380)
}

function advanceFields(): void {
  fieldIndex.value += 1
  if (fieldIndex.value < fieldQueue.value.length) {
    aiReply(fieldQueue.value[fieldIndex.value]?.question ?? '')
  } else {
    phase.value = 'confirm'
    aiReply(t('ops.workflows.create.preview'), 380)
  }
}

function onSend(text?: string): void {
  const value = (text ?? input.value).trim()
  if (!value || awaiting.value || phase.value === 'confirm') return
  pushMessage('user', value)
  input.value = ''
  void nextTick(() => inputRef.value?.resize())

  if (phase.value === 'collect-type') {
    const type = detectType(value)
    if (!type) {
      aiReply(t('ops.workflows.create.unrecognized'))
      return
    }
    beginType(type)
    return
  }

  const field = fieldQueue.value[fieldIndex.value]
  if (field) draft[field.key] = field.parse ? field.parse(value) : value
  advanceFields()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    onSend()
  }
}

function restart(): void {
  window.clearTimeout(replyTimer)
  resetState()
  aiReply(t('ops.workflows.create.restartMsg'), 300)
}

async function submit(): Promise<void> {
  if (!detectedType.value || submitting.value) return
  submitting.value = true
  try {
    await workflows.create({
      type: detectedType.value,
      title: buildTitle(detectedType.value, draft),
      fields: previewFields.value,
      amountCent: previewAmountCent.value,
    })
    toast.success(t('ops.workflows.create.submitted'))
    emit('submitted')
    emit('close')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('common.empty'))
  } finally {
    submitting.value = false
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) {
      window.clearTimeout(replyTimer)
      return
    }
    startFresh()
    if (props.presetType) {
      pushMessage('user', TYPE_LABEL[props.presetType])
      beginType(props.presetType)
    }
  },
)
</script>

<template>
  <BaseModal
    :open="open"
    :title="t('ops.workflows.create.title')"
    size="lg"
    :close-on-overlay="false"
    @close="emit('close')"
  >
    <div class="builder">
      <div ref="scrollRef" class="builder__chat">
        <div
          v-for="message in messages"
          :key="message.id"
          class="builder__msg"
          :class="`builder__msg--${message.role}`"
        >
          <span v-if="message.role === 'ai'" class="builder__avatar">
            <Icon name="sparkles" :size="14" />
          </span>
          <p class="builder__bubble">{{ message.text }}</p>
        </div>

        <!-- 示例提示（初始阶段） -->
        <div v-if="phase === 'collect-type' && messages.length <= 1" class="builder__examples">
          <p class="builder__examples-title">{{ t('ops.workflows.create.examplesTitle') }}</p>
          <button
            v-for="example in examplePrompts"
            :key="example"
            class="builder__example"
            @click="onSend(example)"
          >
            {{ example }}
          </button>
        </div>

        <!-- 审批单预览（结构化结果，提交前人工确认） -->
        <div v-if="phase === 'confirm' && detectedType" class="builder__preview">
          <header class="builder__preview-head">
            <BaseTag tone="info">{{ t(`ops.workflows.type.${detectedType}`) }}</BaseTag>
            <span class="builder__preview-title">{{ t('ops.workflows.create.formTitle') }}</span>
          </header>
          <dl class="builder__preview-list">
            <div v-for="field in previewFields" :key="field.key" class="builder__preview-row">
              <dt>{{ field.label }}</dt>
              <dd>{{ field.value }}</dd>
            </div>
            <div class="builder__preview-row">
              <dt>{{ t('ops.workflows.applicant') }}</dt>
              <dd>{{ auth.user?.name }}（{{ auth.user?.department }}）</dd>
            </div>
          </dl>
        </div>

        <p v-if="awaiting" class="builder__typing">
          <span class="builder__dots" aria-hidden="true"><i /><i /><i /></span>
        </p>
      </div>

      <div class="builder__composer">
        <BaseTextarea
          ref="inputRef"
          v-model="input"
          :placeholder="
            phase === 'confirm'
              ? t('ops.workflows.create.confirmPlaceholder')
              : t('ops.workflows.create.placeholder')
          "
          :disabled="phase === 'confirm'"
          :max-height-px="100"
          @keydown="onKeydown"
        />
        <BaseButton
          variant="primary"
          icon-only
          :disabled="!canSend"
          :loading="awaiting"
          @click="onSend()"
        >
          <Icon name="send" :size="16" />
        </BaseButton>
      </div>
    </div>

    <template #footer>
      <BaseButton @click="emit('close')">{{ t('common.cancel') }}</BaseButton>
      <template v-if="phase === 'confirm'">
        <BaseButton @click="restart">{{ t('ops.workflows.create.restart') }}</BaseButton>
        <BaseButton variant="primary" :loading="submitting" @click="submit">
          {{ t('ops.workflows.create.submit') }}
        </BaseButton>
      </template>
    </template>
  </BaseModal>
</template>

<style scoped>
.builder {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.builder__chat {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  max-height: 52vh;
  overflow-y: auto;
  padding: var(--space-1);
}

.builder__msg {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
}

.builder__msg--user {
  flex-direction: row-reverse;
}

.builder__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  margin-top: 2px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--color-ai-1), var(--color-ai-2));
  color: #ffffff;
  flex-shrink: 0;
}

.builder__bubble {
  max-width: 78%;
  padding: 9px 12px;
  border-radius: var(--radius-lg);
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  font-size: var(--font-md);
  line-height: 1.65;
  color: var(--color-text-1);
  white-space: pre-wrap;
}

.builder__msg--user .builder__bubble {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-primary-contrast);
}

/* ---- 示例 ---- */
.builder__examples {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-left: 34px;
}

.builder__examples-title {
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

.builder__example {
  align-self: flex-start;
  max-width: 100%;
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-surface);
  font-size: var(--font-sm);
  color: var(--color-text-2);
  transition:
    border-color var(--duration-fast) var(--ease-standard),
    color var(--duration-fast) var(--ease-standard),
    background-color var(--duration-fast) var(--ease-standard);
}

.builder__example:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-primary-text);
}

/* ---- 预览卡 ---- */
.builder__preview {
  margin-left: 34px;
  padding: var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.builder__preview-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.builder__preview-title {
  font-size: var(--font-sm);
  font-weight: var(--weight-semibold);
  color: var(--color-text-1);
}

.builder__preview-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.builder__preview-row {
  display: flex;
  gap: var(--space-3);
  font-size: var(--font-md);
}

.builder__preview-row dt {
  width: 76px;
  flex-shrink: 0;
  color: var(--color-text-3);
}

.builder__preview-row dd {
  color: var(--color-text-1);
  min-width: 0;
}

/* ---- 输入行 ---- */
.builder__composer {
  display: flex;
  align-items: flex-end;
  gap: var(--space-2);
}

.builder__typing {
  padding-left: 34px;
}

.builder__dots {
  display: inline-flex;
  gap: 3px;
  align-items: center;
}

.builder__dots i {
  width: 4px;
  height: 4px;
  border-radius: var(--radius-full);
  background: var(--color-text-3);
  animation: builder-dot 1.2s infinite ease-in-out;
}

.builder__dots i:nth-child(2) {
  animation-delay: 0.16s;
}

.builder__dots i:nth-child(3) {
  animation-delay: 0.32s;
}

@keyframes builder-dot {
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
</style>
