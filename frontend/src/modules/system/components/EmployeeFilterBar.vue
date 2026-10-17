<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/shared/components/Icon.vue'
import BaseButton from '@/shared/components/base/BaseButton.vue'
import BaseInput from '@/shared/components/base/BaseInput.vue'
import BaseSelect from '@/shared/components/base/BaseSelect.vue'
import type { EmployeeFilters } from '../store'
import type { CompanySummary } from '../types'

const props = defineProps<{
  filters: EmployeeFilters
  companies: CompanySummary[]
  departments: Array<{ id: string; name: string }>
  positions: string[]
  isMultiCompany: boolean
  hasCompanySelection: boolean
  total: number
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:company': [value: string]
  'update:department': [value: string]
  'update:position': [value: string]
  'update:status': [value: EmployeeFilters['status']]
  'update:keyword': [value: string]
  search: []
  reset: []
}>()

const { t } = useI18n()

const companyOptions = computed(() => {
  const options = props.companies.map((company) => ({
    value: company.id,
    label: company.name,
  }))
  if (props.isMultiCompany) {
    options.unshift({ value: '', label: t('system.filters.allCompanies') })
  }
  return options
})

const departmentOptions = computed(() => [
  { value: '', label: t('system.filters.allDepartments') },
  ...props.departments.map((department) => ({
    value: department.id,
    label: department.name,
  })),
])

const positionOptions = computed(() => [
  { value: '', label: t('system.filters.allPositions') },
  ...props.positions.map((position) => ({ value: position, label: position })),
])

const statusOptions = computed(() => [
  { value: '', label: t('system.filters.allStatuses') },
  { value: 'active', label: t('system.status.active') },
  { value: 'disabled', label: t('system.status.disabled') },
  { value: 'locked', label: t('system.status.locked') },
])

const scopeDisabled = computed(() => props.isMultiCompany && !props.hasCompanySelection)

function emitStatus(value: string): void {
  emit('update:status', value as EmployeeFilters['status'])
}

</script>

<template>
  <section class="filter-bar">
    <div class="filter-bar__grid">
      <BaseSelect
        :model-value="filters.companyId"
        :label="t('system.filters.company')"
        :options="companyOptions"
        :disabled="!isMultiCompany"
        @update:model-value="emit('update:company', $event)"
      />
      <BaseSelect
        :model-value="filters.departmentId"
        :label="t('system.filters.department')"
        :options="departmentOptions"
        :disabled="scopeDisabled"
        @update:model-value="emit('update:department', $event)"
      />
      <BaseSelect
        :model-value="filters.position"
        :label="t('system.filters.position')"
        :options="positionOptions"
        :disabled="scopeDisabled"
        @update:model-value="emit('update:position', $event)"
      />
      <BaseSelect
        :model-value="filters.status"
        :label="t('system.filters.status')"
        :options="statusOptions"
        @update:model-value="emitStatus"
      />
      <div class="filter-bar__keyword">
        <BaseInput
          :model-value="filters.keyword"
          :label="t('system.filters.keyword')"
          :placeholder="t('system.filters.keywordPlaceholder')"
          prefix-icon="search"
          @update:model-value="emit('update:keyword', $event)"
          @enter="emit('search')"
        />
      </div>
    </div>

    <p v-if="scopeDisabled" class="filter-bar__hint">
      {{ t('system.filters.selectCompanyHint') }}
    </p>

    <div class="filter-bar__footer">
      <span class="filter-bar__count">
        {{ t('system.filters.resultCount', { count: total }) }}
      </span>
      <div class="filter-bar__actions">
        <BaseButton size="sm" :loading="loading" @click="emit('search')">
          <template #icon><Icon name="search" :size="14" /></template>
          {{ t('system.filters.search') }}
        </BaseButton>
        <BaseButton size="sm" variant="ghost" @click="emit('reset')">
          {{ t('system.filters.reset') }}
        </BaseButton>
      </div>
    </div>
  </section>
</template>

<style scoped>
.filter-bar {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
}

.filter-bar__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(150px, 1fr)) minmax(220px, 1.4fr);
  gap: var(--space-3);
}

.filter-bar__keyword {
  min-width: 0;
}

.filter-bar__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.filter-bar__count {
  font-size: var(--font-sm);
  color: var(--color-text-3);
}

.filter-bar__hint {
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

.filter-bar__actions {
  display: flex;
  gap: var(--space-2);
}

@media (max-width: 1279px) {
  .filter-bar__grid {
    grid-template-columns: repeat(3, minmax(150px, 1fr));
  }
}

@media (max-width: 767px) {
  .filter-bar__grid {
    grid-template-columns: 1fr;
  }
}
</style>
