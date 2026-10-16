<script setup lang="ts">
import Icon from '@/shared/components/Icon.vue'
import LocaleSwitcher from './components/LocaleSwitcher.vue'
import ThemeSwitcher from './components/ThemeSwitcher.vue'
import { appConfig } from '@/core/config'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const year = new Date().getFullYear()
</script>

<template>
  <div class="auth">
    <aside class="auth__brand">
      <div class="auth__brand-top">
        <span class="auth__logo"><Icon name="sparkles" :size="20" :stroke-width="2" /></span>
        <span class="auth__product">{{ appConfig.app.shortName }}</span>
      </div>

      <div class="auth__brand-middle">
        <p class="auth__tagline">{{ t('auth.brand.headline') }}</p>
      </div>

      <p class="auth__copyright">
        {{ t('auth.brand.footer', { year, product: appConfig.app.productName }) }}
      </p>
    </aside>

    <main class="auth__main">
      <div class="auth__topbar">
        <ThemeSwitcher />
        <LocaleSwitcher />
      </div>
      <div class="auth__content">
        <slot />
      </div>
    </main>
  </div>
</template>

<style scoped>
.auth {
  display: flex;
  min-height: 100vh;
}

/* ---- 品牌面板（保持简洁：品牌标识 + 一句品牌语） ---- */
.auth__brand {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 52%;
  max-width: 720px;
  padding: var(--space-8);
  background: var(--gradient-brand);
  color: var(--color-brand-panel-text);
  overflow: hidden;
}

.auth__brand::before,
.auth__brand::after {
  content: '';
  position: absolute;
  border-radius: var(--radius-full);
  pointer-events: none;
}

.auth__brand::before {
  width: 420px;
  height: 420px;
  right: -140px;
  top: -120px;
  background: radial-gradient(circle, rgba(139, 92, 246, 0.35), transparent 65%);
}

.auth__brand::after {
  width: 520px;
  height: 520px;
  left: -180px;
  bottom: -220px;
  background: radial-gradient(circle, rgba(99, 102, 241, 0.3), transparent 65%);
}

.auth__brand-top {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.auth__logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, var(--color-ai-1), var(--color-ai-2));
  color: #ffffff;
  flex-shrink: 0;
}

.auth__product {
  font-size: var(--font-lg);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.02em;
}

.auth__brand-middle {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 1;
  align-items: center;
}

.auth__tagline {
  max-width: 420px;
  font-size: 28px;
  font-weight: var(--weight-semibold);
  line-height: 1.5;
  letter-spacing: 0.01em;
}

.auth__copyright {
  position: relative;
  z-index: 1;
  font-size: var(--font-xs);
  color: var(--color-brand-panel-text-muted);
}

/* ---- 表单区 ---- */
.auth__main {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.auth__topbar {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-1);
  padding: var(--space-4) var(--space-5) 0;
}

.auth__content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
}

@media (max-width: 959px) {
  .auth__brand {
    display: none;
  }
}
</style>
