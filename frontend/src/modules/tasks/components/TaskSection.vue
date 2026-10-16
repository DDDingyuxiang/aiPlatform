<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Icon from '@/shared/components/Icon.vue'
import { usePreferencesStore } from '@/core/preferences/store'
import { formatRelativeTime } from '@/shared/utils/format'
import { useTasksStore } from '../store'
import { displayStatus } from '../types'

const { t, locale } = useI18n()
const router = useRouter()
const preferences = usePreferencesStore()
const tasks = useTasksStore()

onMounted(() => {
  void tasks.loadAll()
})

/** 面板预览：我负责的未完成事项，最多 4 条 */
const items = computed(() => tasks.myPendingTasks.slice(0, 4))

function open(id: string): void {
  preferences.closeMobileNav()
  void router.push({ path: '/tasks', query: { task: id } })
}

function relative(iso: string): string {
  return formatRelativeTime(iso, locale.value, t('common.justNow'))
}
</script>

<template>
  <div class="task-brief">
    <ul v-if="items.length" class="task-brief__list">
      <li v-for="task in items" :key="task.id">
        <button class="task-brief__item" @click="open(task.id)">
          <span class="task-brief__dot" :class="`task-brief__dot--${displayStatus(task)}`" />
          <span class="task-brief__body">
            <span class="task-brief__title u-truncate">{{ task.title }}</span>
            <span
              class="task-brief__meta"
              :class="{ 'task-brief__meta--overdue': displayStatus(task) === 'overdue' }"
            >
              <Icon name="clock" :size="11" />
              {{ relative(task.dueAt) }}
            </span>
          </span>
        </button>
      </li>
    </ul>
    <p v-else class="task-brief__empty">{{ t('ops.tasks.empty') }}</p>

    <RouterLink to="/tasks" class="task-brief__all" @click="preferences.closeMobileNav()">
      {{ t('common.viewAll') }}
      <Icon name="chevron-right" :size="13" />
    </RouterLink>
  </div>
</template>

<style scoped>
.task-brief {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.task-brief__list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.task-brief__item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: 7px 8px;
  border-radius: var(--radius-md);
  text-align: left;
  transition: background-color var(--duration-fast) var(--ease-standard);
}

.task-brief__item:hover {
  background: var(--color-surface-3);
}

.task-brief__dot {
  width: 7px;
  height: 7px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

.task-brief__dot--todo {
  background: var(--color-text-3);
}

.task-brief__dot--inProgress {
  background: var(--color-primary);
}

.task-brief__dot--done {
  background: var(--color-success);
}

.task-brief__dot--overdue {
  background: var(--color-danger);
}

.task-brief__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.task-brief__title {
  font-size: var(--font-sm);
  color: var(--color-text-1);
}

.task-brief__meta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

.task-brief__meta--overdue {
  color: var(--color-danger-text);
}

.task-brief__empty {
  padding: var(--space-3) 8px;
  font-size: var(--font-xs);
  color: var(--color-text-3);
  text-align: center;
}

.task-brief__all {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  align-self: flex-end;
  margin-top: 4px;
  padding: 3px 4px;
  font-size: var(--font-xs);
  color: var(--color-primary-text);
}

.task-brief__all:hover {
  text-decoration: underline;
}
</style>
