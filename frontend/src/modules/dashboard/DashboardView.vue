<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/shared/components/Icon.vue'
import type { IconName } from '@/shared/components/icon-registry'
import BaseCard from '@/shared/components/base/BaseCard.vue'
import BaseCheckbox from '@/shared/components/base/BaseCheckbox.vue'
import BaseTag from '@/shared/components/base/BaseTag.vue'
import StatTile from '@/shared/components/app/StatTile.vue'
import { useAuthStore } from '@/core/auth/store'
import { formatCurrency, formatNumber, formatRelativeTime } from '@/shared/utils/format'
import {
  demoAnnouncements,
  demoApprovals,
  demoInsights,
  demoKpis,
  demoTasks,
  demoWeeklyProgress,
} from './data'
import type { ApprovalType } from './types'

const { t, locale } = useI18n()
const auth = useAuthStore()

const greeting = computed(() => {
  const hour = new Date().getHours()
  const key =
    hour < 12 ? 'common.greeting.morning' : hour < 18 ? 'common.greeting.afternoon' : 'common.greeting.evening'
  return t(key)
})

const todayText = computed(() =>
  new Intl.DateTimeFormat(locale.value, { month: 'long', day: 'numeric', weekday: 'long' }).format(
    new Date(),
  ),
)

const subtitle = computed(() => {
  const count = demoKpis.find((kpi) => kpi.key === 'pendingTasks')?.value ?? 0
  return count > 0
    ? t('dashboard.subtitle', { date: todayText.value, count })
    : t('dashboard.subtitleNoTodo', { date: todayText.value })
})

const kpis = computed(() =>
  demoKpis.map((kpi) => ({
    ...kpi,
    displayValue:
      kpi.format === 'currency'
        ? formatCurrency(kpi.value, locale.value)
        : formatNumber(kpi.value, locale.value),
  })),
)

/** 任务勾选为演示交互；接入后端后改为调用任务接口（需考虑幂等） */
const tasks = reactive(demoTasks.map((task) => ({ ...task })))
const progressPercent = computed(() =>
  Math.round((demoWeeklyProgress.done / demoWeeklyProgress.total) * 100),
)

const APPROVAL_META: Record<
  ApprovalType,
  { icon: IconName; tone: 'warning' | 'info' | 'primary' | 'success' }
> = {
  expense: { icon: 'expense', tone: 'warning' },
  leave: { icon: 'calendar', tone: 'info' },
  purchase: { icon: 'file', tone: 'primary' },
  contract: { icon: 'summary', tone: 'success' },
}

const QUICK_ACTIONS: { icon: IconName; labelKey: string; to: string }[] = [
  { icon: 'tasks', labelKey: 'dashboard.quick.newTask', to: '/tasks' },
  { icon: 'expense', labelKey: 'dashboard.quick.newExpense', to: '/workflows?create=expense' },
  { icon: 'chat', labelKey: 'dashboard.quick.newChat', to: '/chat' },
  { icon: 'knowledge', labelKey: 'dashboard.quick.searchKnowledge', to: '/knowledge' },
  { icon: 'analytics', labelKey: 'dashboard.quick.viewAnalytics', to: '/analytics' },
  { icon: 'announcement', labelKey: 'dashboard.quick.viewAnnouncements', to: '/announcements' },
]

const PRIORITY_TONE = { high: 'danger', medium: 'warning', low: 'neutral' } as const
const CATEGORY_TONE = { policy: 'primary', event: 'info', system: 'neutral', company: 'success' } as const

function relativeTime(iso: string): string {
  return formatRelativeTime(iso, locale.value, t('common.justNow'))
}

function isOverdue(iso: string): boolean {
  return new Date(iso).getTime() < Date.now()
}
</script>

<template>
  <div class="dashboard">
    <!-- 问候区 -->
    <header class="dashboard__hero">
      <div>
        <h2 class="dashboard__greeting">{{ greeting }}，{{ auth.user?.name }}</h2>
        <p class="dashboard__subtitle">{{ subtitle }}</p>
      </div>
      <BaseTag tone="info">{{ t('dashboard.demoNote') }}</BaseTag>
    </header>

    <!-- KPI -->
    <div class="dashboard__kpis">
      <StatTile
        v-for="kpi in kpis"
        :key="kpi.key"
        :icon="kpi.icon"
        :tone="kpi.tone"
        :label="t(`dashboard.kpi.${kpi.key}`)"
        :value="kpi.displayValue"
      >
        <template v-if="kpi.delta" #hint>
          <Icon
            :name="kpi.delta.direction === 'up' ? 'trending-up' : 'trending-down'"
            :size="13"
          />
          <span class="u-tabular">{{ kpi.delta.text }}</span>
        </template>
      </StatTile>
    </div>

    <!-- 主网格 -->
    <div class="dashboard__grid">
      <!-- 待我审批 -->
      <BaseCard class="dashboard__approvals" :title="t('dashboard.sections.pendingApprovals')">
        <template #actions>
          <RouterLink to="/workflows" class="dashboard__link">
            {{ t('common.viewAll') }}
            <Icon name="chevron-right" :size="14" />
          </RouterLink>
        </template>
        <ul class="approval-list">
          <li v-for="item in demoApprovals" :key="item.id" class="approval">
            <span class="approval__icon" :class="`approval__icon--${APPROVAL_META[item.type].tone}`">
              <Icon :name="APPROVAL_META[item.type].icon" :size="17" />
            </span>
            <div class="approval__main">
              <div class="approval__title-row">
                <p class="approval__title u-truncate">{{ item.title }}</p>
                <BaseTag v-if="item.urgent" tone="danger">{{ t('dashboard.urgent') }}</BaseTag>
              </div>
              <p class="approval__meta">
                {{ item.applicant }} · {{ item.department }} · {{ relativeTime(item.submittedAt) }}
              </p>
            </div>
            <p v-if="item.amountCent" class="approval__amount u-tabular">
              {{ formatCurrency(item.amountCent, locale) }}
            </p>
          </li>
        </ul>
      </BaseCard>

      <!-- AI 洞察 -->
      <BaseCard class="dashboard__insights" :title="t('dashboard.sections.aiInsights')">
        <template #actions>
          <BaseTag tone="ai">
            <Icon name="sparkles" :size="12" />
            <span>{{ t('common.ai.generated') }}</span>
          </BaseTag>
        </template>
        <ul class="insight-list">
          <li v-for="insight in demoInsights" :key="insight.id" class="insight">
            <span class="insight__dot" :class="`insight__dot--${insight.tone}`" />
            <p class="insight__text">{{ insight.text }}</p>
          </li>
        </ul>
        <p class="insight__disclaimer">{{ t('common.ai.disclaimer') }}</p>
      </BaseCard>

      <!-- 今日任务 -->
      <BaseCard class="dashboard__tasks" :title="t('dashboard.sections.myTasks')">
        <ul class="task-list">
          <li v-for="task in tasks" :key="task.id" class="task" :class="{ 'task--done': task.done }">
            <BaseCheckbox v-model="task.done" :aria-label="task.title" />
            <div class="task__main">
              <p class="task__title">{{ task.title }}</p>
              <p
                class="task__due"
                :class="{ 'task__due--overdue': !task.done && isOverdue(task.dueAt) }"
              >
                <Icon name="clock" :size="12" />
                {{ relativeTime(task.dueAt) }}
              </p>
            </div>
            <BaseTag :tone="PRIORITY_TONE[task.priority]">
              {{ t(`ops.tasks.priority.${task.priority}`) }}
            </BaseTag>
          </li>
        </ul>
        <div class="progress">
          <div class="progress__head">
            <span>{{ t('dashboard.sections.weeklyProgress') }}</span>
            <span class="u-tabular">
              {{
                t('dashboard.progress.label', {
                  done: demoWeeklyProgress.done,
                  total: demoWeeklyProgress.total,
                })
              }}
            </span>
          </div>
          <div class="progress__track">
            <div class="progress__bar" :style="{ width: `${progressPercent}%` }" />
          </div>
        </div>
      </BaseCard>

      <!-- 快速入口 -->
      <BaseCard class="dashboard__quick" :title="t('dashboard.sections.quickActions')">
        <div class="quick-grid">
          <RouterLink v-for="action in QUICK_ACTIONS" :key="action.to" :to="action.to" class="quick">
            <span class="quick__icon"><Icon :name="action.icon" :size="17" /></span>
            <span class="quick__label">{{ t(action.labelKey) }}</span>
          </RouterLink>
        </div>
      </BaseCard>

      <!-- 最近公告 -->
      <BaseCard class="dashboard__announcements" :title="t('dashboard.sections.recentAnnouncements')">
        <template #actions>
          <RouterLink to="/announcements" class="dashboard__link">
            {{ t('common.viewAll') }}
            <Icon name="chevron-right" :size="14" />
          </RouterLink>
        </template>
        <ul class="notice-list">
          <li v-for="notice in demoAnnouncements" :key="notice.id" class="notice">
            <span class="notice__dot" :class="{ 'notice__dot--unread': notice.unread }" />
            <div class="notice__main">
              <div class="notice__title-row">
                <Icon v-if="notice.pinned" name="pin" :size="13" class="notice__pin" />
                <p class="notice__title u-truncate">{{ notice.title }}</p>
              </div>
              <div class="notice__meta">
                <BaseTag :tone="CATEGORY_TONE[notice.category]">
                  {{ t(`intel.announcements.category.${notice.category}`) }}
                </BaseTag>
                <span class="notice__time">{{ relativeTime(notice.publishedAt) }}</span>
              </div>
            </div>
          </li>
        </ul>
      </BaseCard>
    </div>
  </div>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

/* ---- 问候区 ---- */
.dashboard__hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.dashboard__greeting {
  font-size: var(--font-2xl);
  font-weight: var(--weight-semibold);
  color: var(--color-text-1);
}

.dashboard__subtitle {
  margin-top: 6px;
  font-size: var(--font-md);
  color: var(--color-text-2);
}

/* ---- KPI 行 ---- */
.dashboard__kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-4);
}

/* ---- 主网格（12 列） ---- */
.dashboard__grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: var(--space-4);
}

.dashboard__approvals {
  grid-column: span 7;
}

.dashboard__insights {
  grid-column: span 5;
}

.dashboard__tasks {
  grid-column: span 4;
}

.dashboard__quick {
  grid-column: span 4;
}

.dashboard__announcements {
  grid-column: span 4;
}

.dashboard__link {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: var(--font-sm);
  color: var(--color-primary-text);
}

.dashboard__link:hover {
  text-decoration: underline;
}

/* ---- 审批列表 ---- */
.approval-list {
  display: flex;
  flex-direction: column;
}

.approval {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) 0;
}

.approval + .approval {
  border-top: 1px solid var(--color-border);
}

.approval__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  flex-shrink: 0;
}

.approval__icon--warning {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}

.approval__icon--info {
  background: var(--color-info-soft);
  color: var(--color-info);
}

.approval__icon--primary {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

.approval__icon--success {
  background: var(--color-success-soft);
  color: var(--color-success);
}

.approval__main {
  flex: 1;
  min-width: 0;
}

.approval__title-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.approval__title {
  font-size: var(--font-md);
  font-weight: var(--weight-medium);
  color: var(--color-text-1);
  min-width: 0;
}

.approval__meta {
  margin-top: 2px;
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

.approval__amount {
  font-size: var(--font-md);
  font-weight: var(--weight-semibold);
  color: var(--color-text-1);
  flex-shrink: 0;
}

/* ---- AI 洞察 ---- */
.insight-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.insight {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}

.insight__dot {
  width: 7px;
  height: 7px;
  margin-top: 7px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

.insight__dot--info {
  background: var(--color-info);
}

.insight__dot--warning {
  background: var(--color-warning);
}

.insight__dot--positive {
  background: var(--color-success);
}

.insight__text {
  font-size: var(--font-sm);
  line-height: 1.65;
  color: var(--color-text-2);
}

.insight__disclaimer {
  margin-top: var(--space-4);
  padding-top: var(--space-3);
  border-top: 1px dashed var(--color-border);
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

/* ---- 任务列表 ---- */
.task-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.task {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.task__main {
  flex: 1;
  min-width: 0;
}

.task__title {
  font-size: var(--font-md);
  color: var(--color-text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task--done .task__title {
  color: var(--color-text-3);
  text-decoration: line-through;
}

.task__due {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

.task__due--overdue {
  color: var(--color-danger-text);
}

/* ---- 周进度 ---- */
.progress {
  margin-top: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
}

.progress__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--font-xs);
  color: var(--color-text-3);
  margin-bottom: var(--space-2);
}

.progress__track {
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--color-surface-3);
  overflow: hidden;
}

.progress__bar {
  height: 100%;
  border-radius: var(--radius-full);
  background: linear-gradient(90deg, var(--color-ai-1), var(--color-ai-2));
  transition: width var(--duration-slow) var(--ease-out);
}

/* ---- 快速入口 ---- */
.quick-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-2);
}

.quick {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  transition:
    background-color var(--duration-fast) var(--ease-standard),
    border-color var(--duration-fast) var(--ease-standard),
    transform var(--duration-fast) var(--ease-out);
}

.quick:hover {
  background: var(--color-surface-2);
  border-color: var(--color-border-strong);
  transform: translateY(-1px);
}

.quick__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-sm);
  background: var(--color-primary-soft);
  color: var(--color-primary);
  flex-shrink: 0;
}

.quick__label {
  font-size: var(--font-sm);
  color: var(--color-text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- 公告列表 ---- */
.notice-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.notice {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}

.notice__dot {
  width: 7px;
  height: 7px;
  margin-top: 6px;
  border-radius: var(--radius-full);
  background: transparent;
  border: 1.5px solid var(--color-border-strong);
  flex-shrink: 0;
}

.notice__dot--unread {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.notice__main {
  flex: 1;
  min-width: 0;
}

.notice__title-row {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.notice__pin {
  color: var(--color-warning);
  flex-shrink: 0;
}

.notice__title {
  font-size: var(--font-md);
  font-weight: var(--weight-medium);
  color: var(--color-text-1);
  min-width: 0;
}

.notice__meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: 5px;
}

.notice__time {
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

/* ---- 响应式 ---- */
@media (max-width: 1279px) {
  .dashboard__kpis {
    grid-template-columns: repeat(2, 1fr);
  }

  .dashboard__approvals,
  .dashboard__insights,
  .dashboard__announcements {
    grid-column: span 12;
  }

  .dashboard__tasks,
  .dashboard__quick {
    grid-column: span 6;
  }
}

@media (max-width: 767px) {
  .dashboard__kpis {
    gap: var(--space-3);
  }

  .dashboard__tasks,
  .dashboard__quick {
    grid-column: span 12;
  }
}
</style>
