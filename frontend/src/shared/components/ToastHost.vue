<script setup lang="ts">
import Icon from './Icon.vue'
import type { IconName } from './icon-registry'
import { useToast, type ToastTone } from '@/shared/composables/useToast'

const { toasts, dismiss } = useToast()

const TONE_ICON: Record<ToastTone, IconName> = {
  success: 'check-circle',
  error: 'x-circle',
  info: 'info',
  warning: 'alert-triangle',
}
</script>

<template>
  <Teleport to="body">
    <div class="toast-host" aria-live="polite">
      <TransitionGroup name="toast">
        <div v-for="item in toasts" :key="item.id" class="toast" :class="`toast--${item.tone}`" role="status">
          <Icon :name="TONE_ICON[item.tone]" :size="17" class="toast__icon" />
          <p class="toast__message">{{ item.message }}</p>
          <button class="toast__close" aria-label="close" @click="dismiss(item.id)">
            <Icon name="close" :size="14" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-host {
  position: fixed;
  top: var(--space-4);
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  pointer-events: none;
  width: min(92vw, 480px);
}

.toast {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: fit-content;
  max-width: 100%;
  padding: 10px 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  pointer-events: auto;
}

.toast__icon {
  flex-shrink: 0;
}

.toast--success .toast__icon {
  color: var(--color-success);
}

.toast--error .toast__icon {
  color: var(--color-danger);
}

.toast--info .toast__icon {
  color: var(--color-info);
}

.toast--warning .toast__icon {
  color: var(--color-warning);
}

.toast__message {
  font-size: var(--font-md);
  color: var(--color-text-1);
}

.toast__close {
  display: inline-flex;
  padding: 2px;
  border-radius: var(--radius-xs);
  color: var(--color-text-3);
  transition: color var(--duration-fast) var(--ease-standard);
}

.toast__close:hover {
  color: var(--color-text-1);
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity var(--duration-base) var(--ease-standard),
    transform var(--duration-base) var(--ease-out);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
