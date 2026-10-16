<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseAvatar from '@/shared/components/base/BaseAvatar.vue'
import BaseButton from '@/shared/components/base/BaseButton.vue'
import BaseDrawer from '@/shared/components/base/BaseDrawer.vue'
import BaseTag from '@/shared/components/base/BaseTag.vue'
import { toast } from '@/shared/composables/useToast'
import { formatDate, formatRelativeTime } from '@/shared/utils/format'
import { useTasksStore } from '../store'
import { displayStatus, type TaskItem } from '../types'

const props = defineProps<{ task: TaskItem | null }>()
const emit = defineEmits<{ close: [] }>()

const { t, locale } = useI18n()
const tasks = useTasksStore()
const busy = ref(false)

const status = computed(() => (props.task ? displayStatus(props.task) : 'todo'))

const STATUS_TONE = { todo: 'neutral', inProgress: 'primary', done: 'success', overdue: 'danger' } as const
const PRIORITY_TONE = { high: 'danger', medium: 'warning', low: 'neutral' } as const

async function update(statusValue: TaskItem['status']): Promise<void> {
  if (!props.task || busy.value) return
  busy.value = true
  try {
    await tasks.setStatus(props.task.id, statusValue)
    toast.success(t('ops.tasks.updated'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('common.empty'))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <BaseDrawer :open="!!task" :title="task?.title" :width="520" @close="emit('close')">
    <div v-if="task" class="task-detail">
      <div class="task-detail__tags">
        <BaseTag :tone="STATUS_TONE[status]" dot>{{ t(`ops.tasks.status.${status}`) }}</BaseTag>
        <BaseTag :tone="PRIORITY_TONE[task.priority]">
          {{ t('ops.tasks.priority.' + task.priority) }}
        </BaseTag>
      </div>

      <dl class="task-detail__meta">
        <div class="task-detail__row">
          <dt>{{ t('ops.tasks.form.assignee') }}</dt>
          <dd class="task-detail__person">
            <BaseAvatar :name="task.assignee.name" :size="22" />
            {{ task.assignee.name }}
          </dd>
        </div>
        <div class="task-detail__row">
          <dt>{{ t('ops.tasks.creator') }}</dt>
          <dd class="task-detail__person">
            <BaseAvatar :name="task.creator.name" :size="22" />
            {{ task.creator.name }}
          </dd>
        </div>
        <div class="task-detail__row">
          <dt>{{ t('ops.tasks.dueLabel') }}</dt>
          <dd :class="{ 'task-detail__overdue': status === 'overdue' }">
            {{ formatDate(task.dueAt, locale) }}（{{ formatRelativeTime(task.dueAt, locale, t('common.justNow')) }}）
          </dd>
        </div>
        <div class="task-detail__row">
          <dt>{{ t('ops.tasks.detail.milestone') }}</dt>
          <dd>
            <BaseTag v-if="task.milestoneName" tone="info">{{ task.milestoneName }}</BaseTag>
            <span v-else class="task-detail__muted">{{ t('ops.tasks.detail.noMilestone') }}</span>
          </dd>
        </div>
      </dl>

      <section class="task-detail__section">
        <p class="task-detail__section-title">{{ t('ops.tasks.detail.progress') }}</p>
        <div class="task-detail__progress-row">
          <div class="task-detail__track">
            <div class="task-detail__bar" :style="{ width: `${task.progress}%` }" />
          </div>
          <span class="u-tabular">{{ task.progress }}%</span>
        </div>
      </section>

      <section v-if="task.description" class="task-detail__section">
        <p class="task-detail__section-title">{{ t('ops.tasks.detail.description') }}</p>
        <p class="task-detail__text">{{ task.description }}</p>
      </section>
    </div>

    <template #footer>
      <BaseButton v-if="task && task.status !== 'done'" variant="secondary" :loading="busy" @click="update('inProgress')">
        {{ t('ops.tasks.detail.markInProgress') }}
      </BaseButton>
      <BaseButton v-if="task && task.status !== 'done'" variant="primary" :loading="busy" @click="update('done')">
        {{ t('ops.tasks.detail.markDone') }}
      </BaseButton>
      <BaseButton v-if="task && task.status === 'done'" variant="secondary" :loading="busy" @click="update('inProgress')">
        {{ t('ops.tasks.detail.markInProgress') }}
      </BaseButton>
    </template>
  </BaseDrawer>
</template>

<style scoped>
.task-detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.task-detail__tags {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.task-detail__meta {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.task-detail__row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.task-detail__row dt {
  width: 72px;
  flex-shrink: 0;
  font-size: var(--font-sm);
  color: var(--color-text-3);
}

.task-detail__row dd {
  font-size: var(--font-md);
  color: var(--color-text-1);
}

.task-detail__person {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.task-detail__overdue {
  color: var(--color-danger-text);
}

.task-detail__muted {
  color: var(--color-text-3);
}

.task-detail__section-title {
  margin-bottom: var(--space-2);
  font-size: var(--font-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text-2);
}

.task-detail__progress-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--font-sm);
  color: var(--color-text-2);
}

.task-detail__track {
  flex: 1;
  height: 7px;
  border-radius: var(--radius-full);
  background: var(--color-surface-3);
  overflow: hidden;
}

.task-detail__bar {
  height: 100%;
  border-radius: var(--radius-full);
  background: linear-gradient(90deg, var(--color-ai-1), var(--color-ai-2));
  transition: width var(--duration-slow) var(--ease-out);
}

.task-detail__text {
  font-size: var(--font-md);
  line-height: 1.7;
  color: var(--color-text-2);
  white-space: pre-wrap;
}
</style>
