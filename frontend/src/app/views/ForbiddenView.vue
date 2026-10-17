<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import BaseButton from '@/shared/components/base/BaseButton.vue'

const { t } = useI18n()
const router = useRouter()
</script>

<template>
  <div class="forbidden">
    <p class="forbidden__code u-text-gradient">403</p>
    <h1 class="forbidden__title">{{ t('nav.forbidden.title') }}</h1>
    <p class="forbidden__desc">{{ t('nav.forbidden.desc') }}</p>
    <BaseButton variant="primary" @click="router.push({ name: 'dashboard' })">
      {{ t('nav.forbidden.back') }}
    </BaseButton>
  </div>
</template>

<style scoped>
.forbidden {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  min-height: 100vh;
  padding: var(--space-6);
  text-align: center;
  background: var(--color-bg);
}

.forbidden__code {
  font-size: 88px;
  font-weight: var(--weight-bold);
  line-height: 1;
  letter-spacing: 0.02em;
}

.forbidden__title {
  font-size: var(--font-2xl);
  color: var(--color-text-1);
}

.forbidden__desc {
  margin-bottom: var(--space-4);
  font-size: var(--font-md);
  color: var(--color-text-3);
}
</style>
