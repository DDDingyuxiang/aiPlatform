<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import BaseButton from '@/shared/components/base/BaseButton.vue'

const { t } = useI18n()
const router = useRouter()
</script>

<template>
  <div class="not-found">
    <p class="not-found__code u-text-gradient">404</p>
    <h1 class="not-found__title">{{ t('nav.notFound.title') }}</h1>
    <p class="not-found__desc">{{ t('nav.notFound.desc') }}</p>
    <BaseButton variant="primary" @click="router.push({ name: 'dashboard' })">
      {{ t('nav.notFound.back') }}
    </BaseButton>
  </div>
</template>

<style scoped>
.not-found {
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

.not-found__code {
  font-size: 88px;
  font-weight: var(--weight-bold);
  line-height: 1;
  letter-spacing: 0.02em;
}

.not-found__title {
  font-size: var(--font-2xl);
  color: var(--color-text-1);
}

.not-found__desc {
  margin-bottom: var(--space-4);
  font-size: var(--font-md);
  color: var(--color-text-3);
}
</style>
