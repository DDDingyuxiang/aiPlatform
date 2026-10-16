<script setup lang="ts">
withDefaults(
  defineProps<{
    tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'ai'
    size?: 'sm' | 'md'
    /** 展示前置圆点（适合状态类标签） */
    dot?: boolean
  }>(),
  { tone: 'neutral', size: 'sm' },
)
</script>

<template>
  <span class="tag" :class="[`tag--${tone}`, `tag--${size}`]">
    <span v-if="dot" class="tag__dot" aria-hidden="true" />
    <slot />
  </span>
</template>

<style scoped>
.tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: var(--radius-sm);
  font-weight: var(--weight-medium);
  line-height: 1;
  white-space: nowrap;
}

.tag--sm {
  height: 20px;
  padding: 0 7px;
  font-size: var(--font-xs);
}

.tag--md {
  height: 24px;
  padding: 0 9px;
  font-size: var(--font-sm);
}

.tag__dot {
  width: 5px;
  height: 5px;
  border-radius: var(--radius-full);
  background: currentColor;
}

.tag--neutral {
  background: var(--color-surface-3);
  color: var(--color-text-2);
}

.tag--primary {
  background: var(--color-primary-soft);
  color: var(--color-primary-text);
}

.tag--success {
  background: var(--color-success-soft);
  color: var(--color-success-text);
}

.tag--warning {
  background: var(--color-warning-soft);
  color: var(--color-warning-text);
}

.tag--danger {
  background: var(--color-danger-soft);
  color: var(--color-danger-text);
}

.tag--info {
  background: var(--color-info-soft);
  color: var(--color-info-text);
}

.tag--ai {
  background: var(--color-ai-soft);
  color: var(--color-ai-1);
}
</style>
