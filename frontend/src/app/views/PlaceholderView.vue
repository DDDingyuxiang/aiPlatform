<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Icon from '@/shared/components/Icon.vue'

const { t } = useI18n()
const route = useRoute()

const icon = computed(() => route.meta.icon ?? 'sparkles')
const title = computed(() => (route.meta.titleKey ? t(route.meta.titleKey) : ''))
</script>

<template>
  <div class="placeholder">
    <span class="placeholder__icon"><Icon :name="icon" :size="28" /></span>
    <h2 class="placeholder__title">{{ t('nav.placeholder.title', { name: title }) }}</h2>
    <p class="placeholder__desc">{{ t('nav.placeholder.desc') }}</p>
  </div>
</template>

<style scoped>
.placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  min-height: 56vh;
  text-align: center;
}

.placeholder__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: var(--radius-xl);
  background: var(--color-ai-soft);
  color: var(--color-ai-1);
  margin-bottom: var(--space-2);
}

.placeholder__title {
  font-size: var(--font-xl);
  font-weight: var(--weight-semibold);
  color: var(--color-text-1);
}

.placeholder__desc {
  font-size: var(--font-md);
  color: var(--color-text-3);
}
</style>
