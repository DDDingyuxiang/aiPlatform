<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BaseTag from '@/shared/components/base/BaseTag.vue'
import type { AdminRoleSummary, PermissionSummary } from '../types'

defineProps<{
  roles: AdminRoleSummary[]
  permissions: PermissionSummary[]
  loading: boolean
  companySelected: boolean
}>()

const { t } = useI18n()
</script>

<template>
  <section class="role-panel">
    <p v-if="loading" class="role-panel__state">{{ t('common.loading') }}</p>
    <p v-else-if="!companySelected" class="role-panel__state">
      {{ t('system.rolesTab.selectCompanyHint') }}
    </p>

    <template v-else>
      <div class="role-panel__table-wrap">
        <table class="role-panel__table">
          <thead>
            <tr>
              <th>{{ t('system.roles.name') }}</th>
              <th>{{ t('system.roles.code') }}</th>
              <th>{{ t('system.roles.members') }}</th>
              <th>{{ t('system.roles.permissions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="role in roles" :key="role.code">
              <td class="role-panel__strong">{{ role.name }}</td>
              <td><code class="role-panel__code">{{ role.code }}</code></td>
              <td>{{ role.memberCount }}</td>
              <td>
                <span class="role-panel__tags">
                  <BaseTag v-for="permission in role.permissions" :key="permission" tone="info">
                    {{ permission }}
                  </BaseTag>
                  <span v-if="role.permissions.length === 0" class="role-panel__muted">—</span>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="roles.length === 0" class="role-panel__state">{{ t('system.roles.empty') }}</p>

      <div class="role-panel__catalog">
        <h3 class="role-panel__catalog-title">{{ t('system.permissions.title') }}</h3>
        <div class="role-panel__table-wrap">
          <table class="role-panel__table">
            <thead>
              <tr>
                <th>{{ t('system.permissions.code') }}</th>
                <th>{{ t('system.permissions.description') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="permission in permissions" :key="permission.code">
                <td><code class="role-panel__code">{{ permission.code }}</code></td>
                <td>{{ permission.description || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="permissions.length === 0" class="role-panel__state">
          {{ t('system.permissions.empty') }}
        </p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.role-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.role-panel__table-wrap {
  overflow-x: auto;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
}

.role-panel__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-sm);
}

.role-panel__table th {
  padding: 10px 14px;
  text-align: left;
  font-size: var(--font-xs);
  font-weight: var(--weight-medium);
  color: var(--color-text-3);
  white-space: nowrap;
  border-bottom: 1px solid var(--color-border);
}

.role-panel__table td {
  padding: 12px 14px;
  color: var(--color-text-2);
  vertical-align: middle;
}

.role-panel__table tbody tr + tr td {
  border-top: 1px solid var(--color-border);
}

.role-panel__strong {
  color: var(--color-text-1);
  font-weight: var(--weight-medium);
  white-space: nowrap;
}

.role-panel__code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: var(--font-xs);
  color: var(--color-text-1);
}

.role-panel__tags {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
}

.role-panel__muted {
  color: var(--color-text-3);
}

.role-panel__state {
  padding: var(--space-5);
  text-align: center;
  font-size: var(--font-sm);
  color: var(--color-text-3);
}

.role-panel__catalog {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

.role-panel__catalog-title {
  font-size: var(--font-md);
  font-weight: var(--weight-semibold);
  color: var(--color-text-1);
}
</style>
