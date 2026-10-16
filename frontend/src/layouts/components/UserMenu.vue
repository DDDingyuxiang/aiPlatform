<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Icon from '@/shared/components/Icon.vue'
import BaseAvatar from '@/shared/components/base/BaseAvatar.vue'
import BaseDropdown from '@/shared/components/base/BaseDropdown.vue'
import BaseDropdownItem from '@/shared/components/base/BaseDropdownItem.vue'
import { useAuthStore } from '@/core/auth/store'
import { toast } from '@/shared/composables/useToast'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()

const roleLabel = computed(() =>
  auth.user ? t(`auth.role.${auth.user.role}`) : '',
)

function onComingSoon(close: () => void): void {
  close()
  toast.info(t('common.comingSoon'))
}

async function onLogout(close: () => void): Promise<void> {
  close()
  await auth.logout()
  toast.success(t('auth.loggedOut'))
  router.push({ name: 'login' })
}
</script>

<template>
  <BaseDropdown :width="230">
    <template #trigger="{ toggle }">
      <button class="user-trigger" @click="toggle">
        <BaseAvatar :name="auth.user?.name ?? ''" :size="30" />
        <span class="user-trigger__meta">
          <span class="user-trigger__name">{{ auth.user?.name }}</span>
          <span class="user-trigger__dept">{{ auth.user?.department }}</span>
        </span>
        <Icon name="chevron-down" :size="14" class="user-trigger__caret" />
      </button>
    </template>
    <template #default="{ close }">
      <div class="user-menu__head">
        <p class="user-menu__name">{{ auth.user?.name }}</p>
        <p class="user-menu__sub">{{ auth.user?.department }} · {{ roleLabel }}</p>
      </div>
      <div class="user-menu__divider" />
      <BaseDropdownItem icon="user" @click="onComingSoon(close)">
        {{ t('auth.profile') }}
      </BaseDropdownItem>
      <BaseDropdownItem icon="settings" @click="onComingSoon(close)">
        {{ t('auth.settings') }}
      </BaseDropdownItem>
      <div class="user-menu__divider" />
      <BaseDropdownItem icon="logout" danger @click="onLogout(close)">
        {{ t('auth.logout') }}
      </BaseDropdownItem>
    </template>
  </BaseDropdown>
</template>

<style scoped>
.user-trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 3px 8px 3px 3px;
  border-radius: var(--radius-full);
  transition: background-color var(--duration-fast) var(--ease-standard);
}

.user-trigger:hover {
  background: var(--color-surface-3);
}

.user-trigger__meta {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.2;
}

.user-trigger__name {
  font-size: var(--font-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text-1);
}

.user-trigger__dept {
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

.user-trigger__caret {
  color: var(--color-text-3);
}

.user-menu__head {
  padding: 10px 10px 12px;
}

.user-menu__name {
  font-size: var(--font-md);
  font-weight: var(--weight-semibold);
  color: var(--color-text-1);
}

.user-menu__sub {
  margin-top: 2px;
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

.user-menu__divider {
  height: 1px;
  margin: var(--space-1) 0;
  background: var(--color-border);
}

@media (max-width: 767px) {
  .user-trigger__meta,
  .user-trigger__caret {
    display: none;
  }

  .user-trigger {
    padding: 3px;
  }
}
</style>
