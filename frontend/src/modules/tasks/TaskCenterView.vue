<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Icon from '@/shared/components/Icon.vue'
import BaseAvatar from '@/shared/components/base/BaseAvatar.vue'
import BaseButton from '@/shared/components/base/BaseButton.vue'
import BaseInput from '@/shared/components/base/BaseInput.vue'
import BaseTag from '@/shared/components/base/BaseTag.vue'
import TaskDetailDrawer from './components/TaskDetailDrawer.vue'
import TaskFormModal from './components/TaskFormModal.vue'
import { useTasksStore } from './store'
import { displayStatus, type TaskItem } from './types'
import { formatDate, formatRelativeTime } from '@/shared/utils/format'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const tasks = useTasksStore()

type TabKey = 'mine' | 'assigned' | 'milestones'

const activeTab = ref<TabKey>('mine')
const keyword = ref('')
const createOpen = ref(false)
const editingTask = ref<TaskItem | null>(null)

onMounted(() => {
  void tasks.loadAll()
})

/** 详情抽屉由路由 query.task 驱动（面板等入口可深链） */
const activeTask = computed<TaskItem | null>(() => {
  const id = route.query.task
  return typeof id === 'string' && id ? (tasks.taskById(id) ?? null) : null
})

function openTask(id: string): void {
  void router.push({ path: '/tasks', query: { task: id } })
}

function closeTask(): void {
  void router.replace({ path: '/tasks' })
}

function editTask(task: TaskItem): void {
  editingTask.value = task
}

const filteredMine = computed(() => filterTasks(tasks.mineTasks))
const filteredAssigned = computed(() => filterTasks(tasks.assignedTasks))

function filterTasks(list: TaskItem[]): TaskItem[] {
  const query = keyword.value.trim().toLowerCase()
  if (!query) return list
  return list.filter(
    (task) =>
      task.title.toLowerCase().includes(query) || task.description.toLowerCase().includes(query),
  )
}

const STATUS_TONE = { todo: 'neutral', inProgress: 'primary', done: 'success', overdue: 'danger' } as const
const PRIORITY_TONE = { high: 'danger', medium: 'warning', low: 'neutral' } as const
const MILESTONE_TONE = { upcoming: 'neutral', inProgress: 'primary', done: 'success', overdue: 'danger' } as const

function dueText(iso: string): string {
  return formatDate(iso, locale.value)
}

function relative(iso: string): string {
  return formatRelativeTime(iso, locale.value, t('common.justNow'))
}

function milestonePercent(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * 100) : 0
}
</script>

<template>
  <div class="tasks">
    <header class="tasks__hero">
      <div>
        <h2 class="tasks__title">{{ t('nav.tasks') }}</h2>
        <p class="tasks__subtitle">{{ t('ops.tasks.subtitle') }}</p>
      </div>
      <BaseButton variant="primary" @click="createOpen = true">
        <template #icon><Icon name="plus" :size="16" /></template>
        {{ t('ops.tasks.new') }}
      </BaseButton>
    </header>

    <div class="tasks__toolbar">
      <div class="tasks__tabs" role="tablist">
        <button
          v-for="tab in (['mine', 'assigned', 'milestones'] as TabKey[])"
          :key="tab"
          class="tasks__tab"
          :class="{ 'tasks__tab--active': activeTab === tab }"
          role="tab"
          :aria-selected="activeTab === tab"
          @click="activeTab = tab"
        >
          {{ t(`ops.tasks.tabs.${tab}`) }}
        </button>
      </div>
      <div v-if="activeTab !== 'milestones'" class="tasks__search">
        <BaseInput
          v-model="keyword"
          :placeholder="t('ops.tasks.searchPlaceholder')"
          prefix-icon="search"
        />
      </div>
    </div>

    <!-- 任务列表 -->
    <template v-if="activeTab !== 'milestones'">
      <div class="task-table">
        <div class="task-table__head">
          <span>{{ t('ops.tasks.form.name') }}</span>
          <span>{{ t('ops.tasks.form.assignee') }}</span>
          <span>{{ t('ops.tasks.dueLabel') }}</span>
          <span>{{ t('ops.tasks.form.priority') }}</span>
          <span>{{ t('ops.tasks.detail.progress') }}</span>
        </div>
        <button
          v-for="task in activeTab === 'mine' ? filteredMine : filteredAssigned"
          :key="task.id"
          class="task-row"
          @click="openTask(task.id)"
        >
          <span class="task-row__main">
            <span class="task-row__title u-truncate">{{ task.title }}</span>
            <span class="task-row__meta">
              <BaseTag :tone="STATUS_TONE[displayStatus(task)]" size="sm">
                {{ t(`ops.tasks.status.${displayStatus(task)}`) }}
              </BaseTag>
              <span v-if="task.milestoneName" class="task-row__milestone u-truncate">
                <Icon name="workflow" :size="12" />
                {{ task.milestoneName }}
              </span>
            </span>
          </span>
          <span class="task-row__cell task-row__cell--assignee">
            <BaseAvatar :name="task.assignee.name" :size="24" />
            <span class="u-truncate">{{ task.assignee.name }}</span>
          </span>
          <span
            class="task-row__cell u-tabular"
            :class="{ 'task-row__cell--overdue': displayStatus(task) === 'overdue' }"
          >
            {{ dueText(task.dueAt) }}
          </span>
          <span class="task-row__cell">
            <BaseTag :tone="PRIORITY_TONE[task.priority]">
              {{ t(`ops.tasks.priority.${task.priority}`) }}
            </BaseTag>
          </span>
          <span class="task-row__cell task-row__progress">
            <span class="task-row__track">
              <span class="task-row__bar" :style="{ width: `${task.progress}%` }" />
            </span>
            <span class="u-tabular">{{ task.progress }}%</span>
          </span>
        </button>
        <p
          v-if="(activeTab === 'mine' ? filteredMine : filteredAssigned).length === 0"
          class="task-table__empty"
        >
          {{ t('ops.tasks.empty') }}
        </p>
      </div>
    </template>

    <!-- 交付里程碑 -->
    <div v-else class="milestones">
      <article v-for="milestone in tasks.milestones" :key="milestone.id" class="milestone">
        <header class="milestone__head">
          <div class="milestone__title-area">
            <h3 class="milestone__name">{{ milestone.name }}</h3>
            <p class="milestone__project">{{ milestone.project }}</p>
          </div>
          <BaseTag :tone="MILESTONE_TONE[milestone.status]" dot>
            {{ t(`ops.milestones.status.${milestone.status}`) }}
          </BaseTag>
        </header>
        <div class="milestone__progress">
          <div class="milestone__track">
            <div
              class="milestone__bar"
              :style="{ width: `${milestonePercent(milestone.doneTasks, milestone.totalTasks)}%` }"
            />
          </div>
          <span class="u-tabular">
            {{ t('ops.milestones.taskProgress', { done: milestone.doneTasks, total: milestone.totalTasks }) }}
          </span>
        </div>
        <footer class="milestone__footer">
          <span class="milestone__footer-item">
            <BaseAvatar :name="milestone.owner.name" :size="22" />
            {{ milestone.owner.name }}
          </span>
          <span class="milestone__footer-item">
            <Icon name="calendar" :size="14" />
            {{ t('ops.milestones.dueLabel') }}：{{ dueText(milestone.dueAt) }}
            <span class="milestone__relative">（{{ relative(milestone.dueAt) }}）</span>
          </span>
        </footer>
      </article>
      <p v-if="tasks.milestones.length === 0" class="task-table__empty">
        {{ t('ops.milestones.empty') }}
      </p>
    </div>

    <TaskDetailDrawer :task="activeTask" @close="closeTask" @edit="editTask" />
    <TaskFormModal :open="createOpen" @close="createOpen = false" />
    <TaskFormModal
      :open="!!editingTask"
      :task="editingTask"
      @close="editingTask = null"
      @saved="editingTask = null"
    />
  </div>
</template>

<style scoped>
.tasks {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.tasks__hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.tasks__title {
  font-size: var(--font-2xl);
  font-weight: var(--weight-semibold);
  color: var(--color-text-1);
}

.tasks__subtitle {
  margin-top: 6px;
  font-size: var(--font-md);
  color: var(--color-text-2);
}

.tasks__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.tasks__tabs {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  background: var(--color-surface-3);
  border-radius: var(--radius-md);
}

.tasks__tab {
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  font-size: var(--font-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text-2);
  transition:
    background-color var(--duration-fast) var(--ease-standard),
    color var(--duration-fast) var(--ease-standard);
}

.tasks__tab--active {
  background: var(--color-surface);
  color: var(--color-text-1);
  box-shadow: var(--shadow-xs);
}

.tasks__search {
  width: 280px;
  max-width: 100%;
}

/* ---- 任务列表 ---- */
.task-table {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
  overflow: hidden;
}

.task-table__head,
.task-row {
  display: grid;
  grid-template-columns: minmax(0, 2.4fr) 1.1fr 1fr 0.8fr 1.1fr;
  align-items: center;
  gap: var(--space-3);
  padding: 11px var(--space-4);
}

.task-table__head {
  font-size: var(--font-xs);
  font-weight: var(--weight-medium);
  color: var(--color-text-3);
  background: var(--color-surface-2);
  border-bottom: 1px solid var(--color-border);
}

.task-row {
  width: 100%;
  text-align: left;
  border-bottom: 1px solid var(--color-border);
  transition: background-color var(--duration-fast) var(--ease-standard);
}

.task-row:last-of-type {
  border-bottom: none;
}

.task-row:hover {
  background: var(--color-surface-2);
}

.task-row__main {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.task-row__title {
  font-size: var(--font-md);
  font-weight: var(--weight-medium);
  color: var(--color-text-1);
}

.task-row__meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.task-row__milestone {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-xs);
  color: var(--color-text-3);
  min-width: 0;
}

.task-row__cell {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-sm);
  color: var(--color-text-2);
  min-width: 0;
}

.task-row__cell--overdue {
  color: var(--color-danger-text);
}

.task-row__progress {
  gap: var(--space-2);
}

.task-row__track {
  flex: 1;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--color-surface-3);
  overflow: hidden;
}

.task-row__bar {
  display: block;
  height: 100%;
  border-radius: var(--radius-full);
  background: linear-gradient(90deg, var(--color-ai-1), var(--color-ai-2));
}

.task-table__empty {
  padding: var(--space-7);
  text-align: center;
  font-size: var(--font-sm);
  color: var(--color-text-3);
}

/* ---- 里程碑 ---- */
.milestones {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-4);
}

.milestone {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
  transition:
    transform var(--duration-fast) var(--ease-out),
    box-shadow var(--duration-fast) var(--ease-standard);
}

.milestone:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

.milestone__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.milestone__name {
  font-size: var(--font-lg);
  font-weight: var(--weight-semibold);
  color: var(--color-text-1);
}

.milestone__project {
  margin-top: 3px;
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

.milestone__progress {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--font-xs);
  color: var(--color-text-2);
}

.milestone__track {
  flex: 1;
  height: 7px;
  border-radius: var(--radius-full);
  background: var(--color-surface-3);
  overflow: hidden;
}

.milestone__bar {
  height: 100%;
  border-radius: var(--radius-full);
  background: linear-gradient(90deg, var(--color-ai-1), var(--color-ai-2));
  transition: width var(--duration-slow) var(--ease-out);
}

.milestone__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
}

.milestone__footer-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-xs);
  color: var(--color-text-2);
}

.milestone__relative {
  color: var(--color-text-3);
}

/* ---- 响应式 ---- */
@media (max-width: 1023px) {
  .task-table__head {
    display: none;
  }

  .task-row {
    grid-template-columns: 1fr;
    gap: var(--space-2);
    padding: var(--space-4);
  }

  .task-row__cell--assignee,
  .task-row__cell {
    font-size: var(--font-xs);
  }

  .tasks__search {
    width: 100%;
  }
}
</style>
