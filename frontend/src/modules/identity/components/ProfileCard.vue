<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/shared/components/Icon.vue'
import BaseAvatar from '@/shared/components/base/BaseAvatar.vue'
import BaseTag from '@/shared/components/base/BaseTag.vue'
import AttendanceCalendar from './AttendanceCalendar.vue'
import { useAuthStore } from '@/core/auth/store'
import { usePreferencesStore } from '@/core/preferences/store'
import { useIdentityStore } from '../store'

const { t } = useI18n()
const auth = useAuthStore()
const preferences = usePreferencesStore()
const identity = useIdentityStore()

const rows = computed(() => {
  const user = auth.user
  if (!user) return []
  return [
    { label: t('panel.profile.employeeId'), value: user.employeeId },
    { label: t('panel.profile.position'), value: user.position },
    { label: t('panel.profile.department'), value: user.department },
    { label: t('panel.profile.email'), value: user.email },
    { label: t('panel.profile.phone'), value: user.phone },
  ]
})

const roleLabel = computed(() => (auth.user ? t(`auth.role.${auth.user.role}`) : ''))

onMounted(() => {
  void identity.loadAttendance()
})
</script>

<template>
  <!-- 整卡可点击：返回个人主页（工作台），悬浮时背景渐变提示可交互 -->
  <RouterLink
    to="/dashboard"
    class="profile"
    :title="t('nav.backHome')"
    @click="preferences.closeMobileNav()"
  >
    <header class="profile__head">
      <BaseAvatar :name="auth.user?.name ?? ''" :size="44" />
      <div class="profile__ident">
        <p class="profile__name">{{ auth.user?.name }}</p>
        <BaseTag tone="primary">{{ roleLabel }}</BaseTag>
      </div>
    </header>

    <dl class="profile__rows">
      <div v-for="row in rows" :key="row.label" class="profile__row">
        <dt class="profile__label">{{ row.label }}</dt>
        <dd class="profile__value u-truncate" :title="row.value">{{ row.value }}</dd>
      </div>
    </dl>

    <div class="profile__attendance">
      <p class="profile__section-title">
        <Icon name="calendar" :size="14" />
        {{ t('panel.attendance.title') }}
      </p>
      <AttendanceCalendar
        :days="identity.attendance?.days ?? []"
        :month="identity.attendance?.month"
      />
    </div>
  </RouterLink>
</template>

<style scoped>
.profile {
  display: block;
  padding: var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
  cursor: pointer;
  transition:
    background-color var(--duration-base) var(--ease-standard),
    border-color var(--duration-base) var(--ease-standard);
}

.profile:hover {
  background: var(--color-surface-3);
  border-color: var(--color-border-strong);
}

.profile__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.profile__ident {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
  min-width: 0;
}

.profile__name {
  font-size: var(--font-lg);
  font-weight: var(--weight-semibold);
  color: var(--color-text-1);
}

.profile__rows {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: var(--space-4);
}

.profile__row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.profile__label {
  flex-shrink: 0;
  width: 52px;
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

.profile__value {
  flex: 1;
  min-width: 0;
  font-size: var(--font-sm);
  color: var(--color-text-1);
}

.profile__attendance {
  margin-top: var(--space-4);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
}

.profile__section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: var(--space-3);
  font-size: var(--font-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text-2);
}
</style>
