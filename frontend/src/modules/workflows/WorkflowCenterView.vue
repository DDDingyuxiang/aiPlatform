<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Icon from '@/shared/components/Icon.vue'
import type { IconName } from '@/shared/components/icon-registry'
import BaseAvatar from '@/shared/components/base/BaseAvatar.vue'
import BaseButton from '@/shared/components/base/BaseButton.vue'
import BaseTag from '@/shared/components/base/BaseTag.vue'
import ApprovalDetailDrawer from './components/ApprovalDetailDrawer.vue'
import CreateApprovalModal from './components/CreateApprovalModal.vue'
import { useWorkflowsStore } from './store'
import type { ApprovalItem, ApprovalType } from './types'
import { formatCurrency, formatRelativeTime } from '@/shared/utils/format'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const workflows = useWorkflowsStore()

type TabKey = 'pending' | 'mine' | 'processed'

const TABS: TabKey[] = ['pending', 'mine', 'processed']
const VALID_TYPES: ApprovalType[] = ['expense', 'leave', 'purchase', 'contract']

const activeTab = ref<TabKey>('pending')
const createOpen = ref(false)
const presetType = ref<ApprovalType | null>(null)

onMounted(() => {
  void workflows.loadAll()
})

const listByTab = computed<Record<TabKey, ApprovalItem[]>>(() => ({
  pending: workflows.pendingApprovals,
  mine: workflows.myApprovals,
  processed: workflows.processedApprovals,
}))

const currentList = computed(() => listByTab.value[activeTab.value])

/** 详情抽屉由路由 query.approval 驱动（面板等入口可深链） */
const activeApproval = computed<ApprovalItem | null>(() => {
  const id = route.query.approval
  return typeof id === 'string' && id ? (workflows.byId(id) ?? null) : null
})

// 快捷入口：/workflows?create=expense（如仪表盘「新建报销」）
watch(
  () => route.query.create,
  (value) => {
    if (typeof value === 'string' && (VALID_TYPES as string[]).includes(value)) {
      presetType.value = value as ApprovalType
      createOpen.value = true
      void router.replace({ path: '/workflows' })
    }
  },
  { immediate: true },
)

function openCreate(): void {
  presetType.value = null
  if (route.query.approval) void router.replace({ path: '/workflows' })
  createOpen.value = true
}

function openApproval(id: string): void {
  void router.push({ path: '/workflows', query: { approval: id } })
}

function closeApproval(): void {
  void router.replace({ path: '/workflows' })
}

const TYPE_META: Record<ApprovalType, { icon: IconName; tone: 'warning' | 'info' | 'primary' | 'success' }> = {
  expense: { icon: 'expense', tone: 'warning' },
  leave: { icon: 'calendar', tone: 'info' },
  purchase: { icon: 'file', tone: 'primary' },
  contract: { icon: 'summary', tone: 'success' },
}

const STATUS_TONE = { pending: 'warning', approved: 'success', rejected: 'danger' } as const

function relative(iso: string): string {
  return formatRelativeTime(iso, locale.value, t('common.justNow'))
}
</script>

<template>
  <div class="workflows">
    <header class="workflows__hero">
      <div>
        <h2 class="workflows__title">{{ t('nav.workflows') }}</h2>
        <p class="workflows__subtitle">{{ t('ops.workflows.subtitle') }}</p>
      </div>
      <BaseButton variant="primary" @click="openCreate">
        <template #icon><Icon name="sparkles" :size="16" /></template>
        {{ t('ops.workflows.new') }}
      </BaseButton>
    </header>

    <div class="workflows__tabs" role="tablist">
      <button
        v-for="tab in TABS"
        :key="tab"
        class="workflows__tab"
        :class="{ 'workflows__tab--active': activeTab === tab }"
        role="tab"
        :aria-selected="activeTab === tab"
        @click="activeTab = tab"
      >
        {{ t(`ops.workflows.tabs.${tab}`) }}
        <span v-if="tab === 'pending' && workflows.pendingCount" class="workflows__tab-badge u-tabular">
          {{ workflows.pendingCount }}
        </span>
      </button>
    </div>

    <div class="approval-table">
      <button
        v-for="item in currentList"
        :key="item.id"
        class="approval-row"
        @click="openApproval(item.id)"
      >
        <span class="approval-row__icon" :class="`approval-row__icon--${TYPE_META[item.type].tone}`">
          <Icon :name="TYPE_META[item.type].icon" :size="17" />
        </span>
        <span class="approval-row__main">
          <span class="approval-row__title-row">
            <span class="approval-row__title u-truncate">{{ item.title }}</span>
            <BaseTag v-if="item.urgent" tone="danger" size="sm">{{ t('ops.workflows.urgent') }}</BaseTag>
          </span>
          <span class="approval-row__meta">
            <BaseAvatar :name="item.applicant.name" :size="20" />
            <span>{{ item.applicant.name }}</span>
            <span class="approval-row__dim">·</span>
            <span class="approval-row__dim">{{ item.applicant.department }}</span>
            <span class="approval-row__dim">·</span>
            <span class="approval-row__dim">{{ relative(item.submittedAt) }}</span>
          </span>
        </span>
        <span v-if="item.amountCent" class="approval-row__amount">
          {{ formatCurrency(item.amountCent, locale) }}
        </span>
        <BaseTag :tone="STATUS_TONE[item.status]" dot>
          {{ t(`ops.workflows.status.${item.status}`) }}
        </BaseTag>
      </button>
      <p v-if="currentList.length === 0" class="approval-table__empty">
        {{ t(`ops.workflows.empty.${activeTab}`) }}
      </p>
    </div>

    <ApprovalDetailDrawer :approval="activeApproval" @close="closeApproval" />
    <CreateApprovalModal
      :open="createOpen"
      :preset-type="presetType"
      @close="
        () => {
          createOpen = false
          presetType = null
        }
      "
    />
  </div>
</template>

<style scoped>
.workflows {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.workflows__hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.workflows__title {
  font-size: var(--font-2xl);
  font-weight: var(--weight-semibold);
  color: var(--color-text-1);
}

.workflows__subtitle {
  margin-top: 6px;
  font-size: var(--font-md);
  color: var(--color-text-2);
}

.workflows__tabs {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  background: var(--color-surface-3);
  border-radius: var(--radius-md);
  align-self: flex-start;
}

.workflows__tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  font-size: var(--font-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text-2);
  transition:
    background-color var(--duration-fast) var(--ease-standard),
    color var(--duration-fast) var(--ease-standard);
}

.workflows__tab--active {
  background: var(--color-surface);
  color: var(--color-text-1);
  box-shadow: var(--shadow-xs);
}

.workflows__tab-badge {
  min-width: 17px;
  height: 17px;
  padding: 0 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-full);
  background: var(--color-primary);
  color: var(--color-primary-contrast);
  font-size: 11px;
  line-height: 1;
}

/* ---- 列表 ---- */
.approval-table {
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
  overflow: hidden;
}

.approval-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 12px var(--space-4);
  text-align: left;
  border-bottom: 1px solid var(--color-border);
  transition: background-color var(--duration-fast) var(--ease-standard);
}

.approval-row:last-of-type {
  border-bottom: none;
}

.approval-row:hover {
  background: var(--color-surface-2);
}

.approval-row__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  flex-shrink: 0;
}

.approval-row__icon--warning {
  background: var(--color-warning-soft);
  color: var(--color-warning-text);
}

.approval-row__icon--info {
  background: var(--color-info-soft);
  color: var(--color-info-text);
}

.approval-row__icon--primary {
  background: var(--color-primary-soft);
  color: var(--color-primary-text);
}

.approval-row__icon--success {
  background: var(--color-success-soft);
  color: var(--color-success-text);
}

.approval-row__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.approval-row__title-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.approval-row__title {
  font-size: var(--font-md);
  font-weight: var(--weight-medium);
  color: var(--color-text-1);
  min-width: 0;
}

.approval-row__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-xs);
  color: var(--color-text-2);
  min-width: 0;
}

.approval-row__dim {
  color: var(--color-text-3);
}

.approval-row__amount {
  font-size: var(--font-md);
  font-weight: var(--weight-semibold);
  color: var(--color-text-1);
  flex-shrink: 0;
}

.approval-table__empty {
  padding: var(--space-8);
  text-align: center;
  font-size: var(--font-sm);
  color: var(--color-text-3);
}

@media (max-width: 767px) {
  .approval-row {
    flex-wrap: wrap;
    padding: var(--space-3) var(--space-4);
  }

  .approval-row__amount {
    margin-left: 48px;
  }
}
</style>
