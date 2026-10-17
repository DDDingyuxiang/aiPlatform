<script setup lang="ts">
/**
 * 员工管理（平台超管 / 公司管理员）。
 *
 * 平台超管可跨公司筛选与管理；公司管理员只能看到并操作当前企业，
 * 后端会再次校验范围，前端筛选只负责体验。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/shared/components/Icon.vue'
import BaseAvatar from '@/shared/components/base/BaseAvatar.vue'
import BaseButton from '@/shared/components/base/BaseButton.vue'
import BaseConfirmDialog from '@/shared/components/base/BaseConfirmDialog.vue'
import BaseTag from '@/shared/components/base/BaseTag.vue'
import { useAuthStore } from '@/core/auth/store'
import { SUPER_ADMIN_PERMISSION } from '@/core/auth/permissions'
import { toast } from '@/shared/composables/useToast'
import EmployeeFilterBar from './components/EmployeeFilterBar.vue'
import EmployeeFormModal from './components/EmployeeFormModal.vue'
import RolePermissionPanel from './components/RolePermissionPanel.vue'
import { useSystemStore } from './store'
import type { AdminEmployee } from './types'

type TabKey = 'employees' | 'roles'

const TABS: TabKey[] = ['employees', 'roles']

const { t } = useI18n()
const auth = useAuthStore()
const store = useSystemStore()

const activeTab = ref<TabKey>('employees')
const formOpen = ref(false)
const editingEmployee = ref<AdminEmployee | null>(null)
const deleteTarget = ref<AdminEmployee | null>(null)
const deleting = ref(false)

const canSelectCompany = computed(() => auth.hasPermission(SUPER_ADMIN_PERMISSION))
const totalPages = computed(() => Math.max(1, Math.ceil(store.total / store.pageSize)))
const showCompanyColumn = computed(() => store.isMultiCompany)

const STATUS_TONE: Record<
  AdminEmployee['status'],
  'success' | 'neutral' | 'danger'
> = {
  active: 'success',
  disabled: 'neutral',
  locked: 'danger',
}

onMounted(() => {
  void store.initialize()
})

watch(activeTab, (tab) => {
  if (tab === 'roles' && store.hasCompanySelection) void store.loadRoles()
})

async function onCompanyChange(companyId: string): Promise<void> {
  await store.changeCompany(companyId)
  if (activeTab.value === 'roles' && store.hasCompanySelection) {
    await store.loadRoles()
  }
}

function openCreate(): void {
  editingEmployee.value = null
  formOpen.value = true
}

function openEdit(employee: AdminEmployee): void {
  editingEmployee.value = employee
  formOpen.value = true
}

async function onSaved(): Promise<void> {
  await store.loadOptions()
  if (activeTab.value === 'roles' && store.hasCompanySelection) {
    await store.loadRoles()
  }
}

function askDelete(employee: AdminEmployee): void {
  deleteTarget.value = employee
}

async function confirmDelete(): Promise<void> {
  if (!deleteTarget.value) return

  deleting.value = true
  try {
    await store.removeEmployee(deleteTarget.value.id)
    toast.success(t('system.messages.deleted'))
    deleteTarget.value = null
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('system.loadFailed'))
  } finally {
    deleting.value = false
  }
}

async function refresh(): Promise<void> {
  await store.loadOptions()
  await store.loadEmployees()
  if (activeTab.value === 'roles' && store.hasCompanySelection) {
    await store.loadRoles()
  }
}

async function search(): Promise<void> {
  await store.applyFilters()
}

async function reset(): Promise<void> {
  await store.resetFilters()
}
</script>

<template>
  <div class="employees">
    <header class="employees__hero">
      <div>
        <h2 class="employees__title">{{ t('system.title') }}</h2>
        <p class="employees__subtitle">{{ t('system.subtitle') }}</p>
      </div>
      <div class="employees__hero-actions">
        <BaseButton size="sm" :loading="store.loading" @click="refresh">
          <template #icon><Icon name="refresh" :size="14" /></template>
          {{ t('system.refresh') }}
        </BaseButton>
        <BaseButton variant="primary" size="sm" @click="openCreate">
          <template #icon><Icon name="plus" :size="14" /></template>
          {{ t('system.actions.create') }}
        </BaseButton>
      </div>
    </header>

    <div class="employees__tabs" role="tablist">
      <button
        v-for="tab in TABS"
        :key="tab"
        class="employees__tab"
        :class="{ 'employees__tab--active': activeTab === tab }"
        role="tab"
        :aria-selected="activeTab === tab"
        @click="activeTab = tab"
      >
        {{ t(`system.tabs.${tab}`) }}
      </button>
    </div>

    <template v-if="activeTab === 'employees'">
      <EmployeeFilterBar
        :filters="store.filters"
        :companies="store.companies"
        :departments="store.departments"
        :positions="store.positions"
        :is-multi-company="store.isMultiCompany"
        :has-company-selection="store.hasCompanySelection"
        :total="store.total"
        :loading="store.loading"
        @update:company="onCompanyChange"
        @update:department="store.filters.departmentId = $event"
        @update:position="store.filters.position = $event"
        @update:status="store.filters.status = $event"
        @update:keyword="store.filters.keyword = $event"
        @search="search"
        @reset="reset"
      />

      <p v-if="store.loading" class="employees__state">{{ t('common.loading') }}</p>
      <div v-else-if="store.error" class="employees__state employees__state--error">
        <Icon name="alert-circle" :size="16" />
        <span>{{ store.error }}</span>
        <BaseButton size="sm" variant="ghost" @click="refresh">
          {{ t('common.refresh') }}
        </BaseButton>
      </div>

      <template v-else>
        <div class="employees__table-wrap">
          <table class="employees__table">
            <thead>
              <tr>
                <th>{{ t('system.fields.name') }}</th>
                <th>{{ t('system.fields.username') }}</th>
                <th>{{ t('system.fields.employeeNo') }}</th>
                <th v-if="showCompanyColumn">{{ t('system.fields.company') }}</th>
                <th>{{ t('system.fields.department') }}</th>
                <th>{{ t('system.fields.position') }}</th>
                <th>{{ t('system.fields.roles') }}</th>
                <th>{{ t('system.fields.status') }}</th>
                <th class="employees__actions-col">{{ t('common.actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="employee in store.employees" :key="employee.id">
                <td>
                  <span class="employees__person">
                    <BaseAvatar :name="employee.name" :size="28" />
                    <span class="employees__strong">{{ employee.name }}</span>
                  </span>
                </td>
                <td>{{ employee.username }}</td>
                <td>{{ employee.employeeId }}</td>
                <td v-if="showCompanyColumn">{{ employee.company.name }}</td>
                <td>{{ employee.department || '—' }}</td>
                <td>{{ employee.position || '—' }}</td>
                <td>
                  <span class="employees__tags">
                    <BaseTag v-for="role in employee.roles" :key="role.code" tone="neutral">
                      {{ role.name }}
                    </BaseTag>
                    <span v-if="employee.roles.length === 0" class="employees__muted">—</span>
                  </span>
                </td>
                <td>
                  <BaseTag :tone="STATUS_TONE[employee.status]" dot>
                    {{ t(`system.status.${employee.status}`) }}
                  </BaseTag>
                </td>
                <td class="employees__actions-col">
                  <span class="employees__row-actions">
                    <BaseButton
                      icon-only
                      size="sm"
                      variant="ghost"
                      :aria-label="t('system.actions.edit')"
                      :title="t('system.actions.edit')"
                      @click="openEdit(employee)"
                    >
                      <template #icon><Icon name="edit" :size="15" /></template>
                    </BaseButton>
                    <BaseButton
                      icon-only
                      size="sm"
                      variant="ghost"
                      class="employees__delete"
                      :aria-label="t('system.actions.delete')"
                      :title="t('system.actions.delete')"
                      @click="askDelete(employee)"
                    >
                      <template #icon><Icon name="trash" :size="15" /></template>
                    </BaseButton>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="store.employees.length === 0" class="employees__state">
          {{ t('system.empty') }}
        </p>

        <div v-if="store.total > 0" class="employees__pagination">
          <span class="employees__page-info">
            {{ t('system.pagination.info', { page: store.page, total: totalPages, count: store.total }) }}
          </span>
          <div class="employees__page-actions">
            <BaseButton
              size="sm"
              :disabled="store.page <= 1 || store.loading"
              @click="store.changePage(store.page - 1)"
            >
              {{ t('system.pagination.previous') }}
            </BaseButton>
            <BaseButton
              size="sm"
              :disabled="store.page >= totalPages || store.loading"
              @click="store.changePage(store.page + 1)"
            >
              {{ t('system.pagination.next') }}
            </BaseButton>
          </div>
        </div>
      </template>
    </template>

    <RolePermissionPanel
      v-else
      :roles="store.roles"
      :permissions="store.permissions"
      :loading="store.rolesLoading"
      :company-selected="store.hasCompanySelection"
    />

    <EmployeeFormModal
      :open="formOpen"
      :employee="editingEmployee"
      :companies="store.companies"
      :default-company-id="store.filters.companyId || undefined"
      :can-select-company="canSelectCompany"
      @close="formOpen = false"
      @saved="onSaved"
    />

    <BaseConfirmDialog
      :open="!!deleteTarget"
      :title="t('system.confirm.deleteTitle')"
      :message="t('system.confirm.deleteMessage', { name: deleteTarget?.name ?? '' })"
      :confirm-text="t('system.confirm.delete')"
      :loading="deleting"
      @confirm="confirmDelete"
      @close="deleteTarget = null"
    />
  </div>
</template>

<style scoped>
.employees {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.employees__hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.employees__title {
  font-size: var(--font-2xl);
  font-weight: var(--weight-semibold);
  color: var(--color-text-1);
}

.employees__subtitle {
  margin-top: var(--space-1);
  font-size: var(--font-sm);
  color: var(--color-text-3);
}

.employees__hero-actions {
  display: flex;
  gap: var(--space-2);
}

.employees__tabs {
  display: flex;
  gap: var(--space-1);
  padding: 3px;
  background: var(--color-surface-2);
  border-radius: var(--radius-md);
  width: fit-content;
}

.employees__tab {
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  font-size: var(--font-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text-2);
  transition:
    background-color var(--duration-fast) var(--ease-standard),
    color var(--duration-fast) var(--ease-standard);
}

.employees__tab:hover {
  color: var(--color-text-1);
}

.employees__tab--active {
  background: var(--color-surface);
  color: var(--color-text-1);
  box-shadow: var(--shadow-xs);
}

.employees__table-wrap {
  overflow-x: auto;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
}

.employees__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-sm);
}

.employees__table th {
  padding: 10px 14px;
  text-align: left;
  font-size: var(--font-xs);
  font-weight: var(--weight-medium);
  color: var(--color-text-3);
  white-space: nowrap;
  border-bottom: 1px solid var(--color-border);
}

.employees__table td {
  padding: 10px 14px;
  color: var(--color-text-2);
  vertical-align: middle;
}

.employees__table tbody tr + tr td {
  border-top: 1px solid var(--color-border);
}

.employees__person {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  white-space: nowrap;
}

.employees__strong {
  color: var(--color-text-1);
  font-weight: var(--weight-medium);
}

.employees__tags {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
}

.employees__muted {
  color: var(--color-text-3);
}

.employees__actions-col {
  width: 1%;
  text-align: right;
}

.employees__row-actions {
  display: inline-flex;
  gap: 2px;
  justify-content: flex-end;
}

.employees__delete {
  color: var(--color-danger-text);
}

.employees__state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-5);
  text-align: center;
  font-size: var(--font-sm);
  color: var(--color-text-3);
}

.employees__state--error {
  color: var(--color-danger-text);
}

.employees__pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.employees__page-info {
  font-size: var(--font-sm);
  color: var(--color-text-3);
}

.employees__page-actions {
  display: flex;
  gap: var(--space-2);
}
</style>
