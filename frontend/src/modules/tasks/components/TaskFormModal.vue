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
import type { TaskPriority } from '../types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; created: [] }>()

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

const today = new Date().toISOString().slice(0, 10)

const assigneeOptions = computed(() =>
  identity.members
    .filter((member) => member.id !== auth.user?.id)
    .map((member) => ({ value: member.id, label: `${member.name}（${member.department}）` })),
)

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
    Object.assign(form, {
      title: '',
      description: '',
      priority: 'medium' as TaskPriority,
      dueAt: '',
      assigneeId: '',
      milestoneId: '',
    })
    errors.title = ''
    errors.assigneeId = ''
  },
)

async function submit(): Promise<void> {
  errors.title = form.title.trim() ? '' : t('common.validation.required')
  errors.assigneeId = form.assigneeId ? '' : t('common.validation.required')
  if (errors.title || errors.assigneeId || submitting.value) return
  submitting.value = true
  try {
    await tasks.create({
      title: form.title.trim(),
      description: form.description.trim(),
      priority: form.priority,
      dueAt: form.dueAt || today,
      assigneeId: form.assigneeId,
      milestoneId: form.milestoneId || undefined,
    })
    toast.success(t('ops.tasks.saved'))
    emit('created')
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
    :title="t('ops.tasks.new')"
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
        {{ t('common.submit') }}
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
