<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseButton from '@/shared/components/base/BaseButton.vue'
import BaseInput from '@/shared/components/base/BaseInput.vue'
import BaseModal from '@/shared/components/base/BaseModal.vue'
import BaseSelect from '@/shared/components/base/BaseSelect.vue'
import BaseTextarea from '@/shared/components/base/BaseTextarea.vue'
import { useAuthStore } from '@/core/auth/store'
import { useIdentityStore } from '@/modules/identity'
import { toast } from '@/shared/composables/useToast'
import { useTasksStore } from '../store'
import type { TaskItem, TaskPriority, UpdateTaskPayload } from '../types'

const props = defineProps<{ open: boolean; task?: TaskItem | null }>()
const emit = defineEmits<{ close: []; saved: [] }>()

const { t } = useI18n()
const auth = useAuthStore()
const identity = useIdentityStore()
const tasks = useTasksStore()

const form = reactive({
  title: '',
  description: '',
  priority: 'medium' as TaskPriority,
  dueAt: '',
  assigneeId: '',
  milestoneId: '',
})
const errors = reactive({ title: '', assigneeId: '' })
const submitting = ref(false)

const editing = computed(() => !!props.task)

/** 截止日期按业务时区（与后端 APP_TIMEZONE 默认值一致）取 YYYY-MM-DD */
function toDateInput(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso))
  const pick = (type: string): string =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${pick('year')}-${pick('month')}-${pick('day')}`
}

const today = toDateInput(new Date().toISOString())

const assigneeOptions = computed(() => {
  const options = identity.members
    // 新建时默认分配给同事；编辑时保留当前负责人（可能也是自己）
    .filter((member) => (editing.value ? true : member.id !== auth.user?.id))
    .map((member) => ({ value: member.id, label: `${member.name}（${member.department}）` }))
  const current = props.task?.assignee
  if (current && !options.some((option) => option.value === current.id)) {
    options.unshift({ value: current.id, label: current.name })
  }
  return options
})

const priorityOptions = computed(() => [
  { value: 'high', label: t('ops.tasks.priority.high') },
  { value: 'medium', label: t('ops.tasks.priority.medium') },
  { value: 'low', label: t('ops.tasks.priority.low') },
])

const milestoneOptions = computed(() =>
  tasks.milestones.map((milestone) => ({ value: milestone.id, label: milestone.name })),
)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    void identity.loadDirectory()
    Object.assign(
      form,
      props.task
        ? {
            title: props.task.title,
            description: props.task.description,
            priority: props.task.priority,
            dueAt: toDateInput(props.task.dueAt),
            assigneeId: props.task.assignee.id,
            milestoneId: props.task.milestoneId ?? '',
          }
        : {
            title: '',
            description: '',
            priority: 'medium' as TaskPriority,
            dueAt: '',
            assigneeId: '',
            milestoneId: '',
          },
    )
    errors.title = ''
    errors.assigneeId = ''
  },
)

async function submit(): Promise<void> {
  const title = form.title.trim()
  const description = form.description.trim()
  const dueAt = form.dueAt || today
  errors.title = title ? '' : t('common.validation.required')
  errors.assigneeId = form.assigneeId ? '' : t('common.validation.required')
  if (errors.title || errors.assigneeId || submitting.value) return
  submitting.value = true
  try {
    if (props.task) {
      // 只提交发生变化的字段：未改截止日期时保留 AI 抽取的原始时刻
      const payload: UpdateTaskPayload = {}
      if (title !== props.task.title) payload.title = title
      if (description !== props.task.description) payload.description = description
      if (form.priority !== props.task.priority) payload.priority = form.priority
      if (dueAt !== toDateInput(props.task.dueAt)) payload.dueAt = dueAt
      if (form.assigneeId !== props.task.assignee.id) {
        payload.assigneeId = form.assigneeId
      }

      if (Object.keys(payload).length === 0) {
        toast.info(t('ops.tasks.noChanges'))
        emit('close')
        return
      }
      await tasks.update(props.task.id, payload)
      toast.success(t('ops.tasks.editSaved'))
    } else {
      await tasks.create({
        title,
        description,
        priority: form.priority,
        dueAt,
        assigneeId: form.assigneeId,
        milestoneId: form.milestoneId || undefined,
      })
      toast.success(t('ops.tasks.saved'))
    }
    emit('saved')
    emit('close')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('ops.tasks.empty'))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <BaseModal
    :open="open"
    :title="editing ? t('ops.tasks.editTitle') : t('ops.tasks.new')"
    size="lg"
    :close-on-overlay="false"
    @close="emit('close')"
  >
    <form class="task-form" @submit.prevent="submit">
      <BaseInput
        v-model="form.title"
        :label="t('ops.tasks.form.name')"
        :placeholder="t('ops.tasks.form.namePlaceholder')"
        :error="errors.title"
        required
      />
      <BaseTextarea
        v-model="form.description"
        :placeholder="t('ops.tasks.form.descriptionPlaceholder')"
        :max-height-px="120"
      />
      <div class="task-form__grid">
        <BaseSelect
          v-model="form.assigneeId"
          :label="t('ops.tasks.form.assignee')"
          :options="assigneeOptions"
          :placeholder="t('ops.tasks.form.assigneePlaceholder')"
          :error="errors.assigneeId"
          required
        />
        <BaseSelect
          v-model="form.priority"
          :label="t('ops.tasks.form.priority')"
          :options="priorityOptions"
        />
        <BaseInput
          v-model="form.dueAt"
          type="date"
          :label="t('ops.tasks.form.dueDate')"
          :max="'2099-12-31'"
        />
        <BaseSelect
          v-model="form.milestoneId"
          :label="t('ops.tasks.form.milestone')"
          :options="milestoneOptions"
          :placeholder="t('ops.tasks.form.milestonePlaceholder')"
        />
      </div>
    </form>
    <template #footer>
      <BaseButton @click="emit('close')">{{ t('common.cancel') }}</BaseButton>
      <BaseButton variant="primary" :loading="submitting" @click="submit">
        {{ editing ? t('common.save') : t('common.submit') }}
      </BaseButton>
    </template>
  </BaseModal>
</template>

<style scoped>
.task-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.task-form__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}

@media (max-width: 640px) {
  .task-form__grid {
    grid-template-columns: 1fr;
  }
}
</style>
