<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger' | 'ai'
    size?: 'sm' | 'md' | 'lg'
    type?: 'button' | 'submit' | 'reset'
    loading?: boolean
    disabled?: boolean
    /** 撑满父容器宽度 */
    block?: boolean
    /** 方形图标按钮（不带文字） */
    iconOnly?: boolean
  }>(),
  { variant: 'secondary', size: 'md', type: 'button' },
)
</script>

<template>
  <button
    class="btn"
    :class="[
      `btn--${variant}`,
      `btn--${size}`,
      { 'btn--block': block, 'btn--icon-only': iconOnly, 'btn--loading': loading },
    ]"
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
  >
    <span v-if="loading" class="btn__spinner" aria-hidden="true" />
    <span class="btn__content" :class="{ 'btn__content--hidden': loading }">
      <slot name="icon" />
      <slot />
      <slot name="suffix" />
    </span>
  </button>
</template>

<style scoped>
.btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-weight: var(--weight-medium);
  white-space: nowrap;
  user-select: none;
  transition:
    background-color var(--duration-fast) var(--ease-standard),
    border-color var(--duration-fast) var(--ease-standard),
    color var(--duration-fast) var(--ease-standard),
    box-shadow var(--duration-fast) var(--ease-standard);
}

.btn__content {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.btn__content--hidden {
  visibility: hidden;
}

.btn__spinner {
  position: absolute;
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: var(--radius-full);
  animation: btn-spin 0.7s linear infinite;
  opacity: 0.9;
}

@keyframes btn-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ---- 尺寸 ---- */
.btn--sm {
  height: 30px;
  padding: 0 10px;
  font-size: var(--font-sm);
}

.btn--md {
  height: 36px;
  padding: 0 14px;
  font-size: var(--font-md);
}

.btn--lg {
  height: 42px;
  padding: 0 18px;
  font-size: var(--font-md);
}

.btn--icon-only {
  padding: 0;
  width: 36px;
}

.btn--icon-only.btn--sm {
  width: 30px;
  padding: 0;
}

.btn--icon-only.btn--lg {
  width: 42px;
  padding: 0;
}

.btn--block {
  display: flex;
  width: 100%;
}

/* ---- 变体 ---- */
.btn--primary {
  background: var(--color-primary);
  color: var(--color-primary-contrast);
  box-shadow: var(--shadow-xs);
}

.btn--primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.btn--primary:active:not(:disabled) {
  background: var(--color-primary-active);
}

.btn--secondary {
  background: var(--color-surface);
  border-color: var(--color-border);
  color: var(--color-text-1);
  box-shadow: var(--shadow-xs);
}

.btn--secondary:hover:not(:disabled) {
  background: var(--color-surface-2);
  border-color: var(--color-border-strong);
}

.btn--ghost {
  background: transparent;
  color: var(--color-text-2);
}

.btn--ghost:hover:not(:disabled) {
  background: var(--color-surface-3);
  color: var(--color-text-1);
}

.btn--subtle {
  background: var(--color-primary-soft);
  color: var(--color-primary-text);
}

.btn--subtle:hover:not(:disabled) {
  background: var(--color-primary-soft-hover);
}

.btn--danger {
  background: var(--color-danger);
  color: #ffffff;
  box-shadow: var(--shadow-xs);
}

.btn--danger:hover:not(:disabled) {
  filter: brightness(0.94);
}

.btn--ai {
  background: linear-gradient(120deg, var(--color-ai-1), var(--color-ai-2));
  color: #ffffff;
  box-shadow: var(--shadow-xs);
}

.btn--ai:hover:not(:disabled) {
  filter: brightness(1.06);
  box-shadow: var(--shadow-sm);
}

.btn:disabled {
  opacity: 0.55;
}
</style>
