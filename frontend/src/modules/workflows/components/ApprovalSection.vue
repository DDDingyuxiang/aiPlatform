<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Icon from '@/shared/components/Icon.vue'
import type { IconName } from '@/shared/components/icon-registry'
import BaseButton from '@/shared/components/base/BaseButton.vue'
import CreateApprovalModal from './CreateApprovalModal.vue'
import { usePreferencesStore } from '@/core/preferences/store'
import { formatCurrency, formatRelativeTime } from '@/shared/utils/format'
import { useWorkflowsStore } from '../store'
import type { ApprovalType } from '../types'

const { t, locale } = useI18n()
const router = useRouter()
const preferences = usePreferencesStore()
const workflows = useWorkflowsStore()

const createOpen = ref(false)

onMounted(() => {
  void workflows.loadAll()
})

const items = computed(() => workflows.pendingApprovals.slice(0, 3))

const TYPE_META: Record<ApprovalType, { icon: IconName; tone: 'warning' | 'info' | 'primary' | 'success' }> = {
  expense: { icon: 'expense', tone: 'warning' },
  leave: { icon: 'calendar', tone: 'info' },
  purchase: { icon: 'file', tone: 'primary' },
  contract: { icon: 'summary', tone: 'success' },
}

function open(id: string): void {
  preferences.closeMobileNav()
  void router.push({ path: '/workflows', query: { approval: id } })
}

function relative(iso: string): string {
  return formatRelativeTime(iso, locale.value, t('common.justNow'))
}
</script>

<template>
  <div class="approval-brief">
    <ul v-if="items.length" class="approval-brief__list">
      <li v-for="item in items" :key="item.id">
        <button class="approval-brief__item" @click="open(item.id)">
          <span class="approval-brief__icon" :class="`approval-brief__icon--${TYPE_META[item.type].tone}`">
            <Icon :name="TYPE_META[item.type].icon" :size="15" />
          </span>
          <span class="approval-brief__body">
            <span class="approval-brief__title u-truncate">{{ item.title }}</span>
            <span class="approval-brief__meta">
              {{ item.applicant.name }} · {{ relative(item.submittedAt) }}
              <span v-if="item.amountCent" class="approval-brief__amount">
                {{ formatCurrency(item.amountCent, locale) }}
              </span>
            </span>
          </span>
        </button>
      </li>
    </ul>
    <p v-else class="approval-brief__empty">{{ t('ops.workflows.empty.pending') }}</p>

    <BaseButton size="sm" variant="subtle" block class="approval-brief__new" @click="createOpen = true">
      <template #icon><Icon name="sparkles" :size="14" /></template>
      {{ t('ops.workflows.new') }}
    </BaseButton>
    <RouterLink to="/workflows" class="approval-brief__all" @click="preferences.closeMobileNav()">
      {{ t('common.viewAll') }}
      <Icon name="chevron-right" :size="13" />
    </RouterLink>

    <CreateApprovalModal :open="createOpen" @close="createOpen = false" />
  </div>
</template>

<style scoped>
.approval-brief {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.approval-brief__list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.approval-brief__item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: 7px 8px;
  border-radius: var(--radius-md);
  text-align: left;
  transition: background-color var(--duration-fast) var(--ease-standard);
}

.approval-brief__item:hover {
  background: var(--color-surface-3);
}

.approval-brief__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.approval-brief__icon--warning {
  background: var(--color-warning-soft);
  color: var(--color-warning-text);
}

.approval-brief__icon--info {
  background: var(--color-info-soft);
  color: var(--color-info-text);
}

.approval-brief__icon--primary {
  background: var(--color-primary-soft);
  color: var(--color-primary-text);
}

.approval-brief__icon--success {
  background: var(--color-success-soft);
  color: var(--color-success-text);
}

.approval-brief__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.approval-brief__title {
  font-size: var(--font-sm);
  color: var(--color-text-1);
}

.approval-brief__meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-xs);
  color: var(--color-text-3);
  min-width: 0;
}

.approval-brief__amount {
  margin-left: auto;
  color: var(--color-text-2);
  white-space: nowrap;
}

.approval-brief__empty {
  padding: var(--space-3) 8px;
  font-size: var(--font-xs);
  color: var(--color-text-3);
  text-align: center;
}

.approval-brief__new {
  margin-top: var(--space-2);
}

.approval-brief__all {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  align-self: flex-end;
  margin-top: 6px;
  padding: 3px 4px;
  font-size: var(--font-xs);
  color: var(--color-primary-text);
}

.approval-brief__all:hover {
  text-decoration: underline;
}
</style>
