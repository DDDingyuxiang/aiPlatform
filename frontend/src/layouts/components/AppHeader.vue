<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Icon from '@/shared/components/Icon.vue'
import LocaleSwitcher from './LocaleSwitcher.vue'
import ThemeSwitcher from './ThemeSwitcher.vue'
import UserMenu from './UserMenu.vue'
import { usePreferencesStore } from '@/core/preferences/store'
import { useBreakpoint } from '@/shared/composables/useBreakpoint'

const { t } = useI18n()
const route = useRoute()
const preferences = usePreferencesStore()
const { isMobile } = useBreakpoint()

const pageTitle = computed(() => (route.meta.titleKey ? t(route.meta.titleKey) : ''))
</script>

<template>
  <header class="app-header">
    <div class="app-header__left">
      <button
        v-if="isMobile"
        class="icon-btn"
        :aria-label="t('nav.dashboard')"
        @click="preferences.openMobileNav()"
      >
        <Icon name="menu" :size="20" />
      </button>
      <h1 class="app-header__title">{{ pageTitle }}</h1>
    </div>
    <div class="app-header__right">
      <ThemeSwitcher />
      <LocaleSwitcher />
      <span class="app-header__divider" aria-hidden="true" />
      <UserMenu />
    </div>
  </header>
</template>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  height: var(--header-height);
  padding: 0 var(--space-6);
  background: var(--color-header-bg);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--color-border);
}

.app-header__left {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.app-header__title {
  font-size: var(--font-lg);
  font-weight: var(--weight-semibold);
  color: var(--color-text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.app-header__right {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.app-header__divider {
  width: 1px;
  height: 20px;
  margin: 0 var(--space-2);
  background: var(--color-border);
}

@media (max-width: 767px) {
  .app-header {
    padding: 0 var(--space-3);
  }
}
</style>
