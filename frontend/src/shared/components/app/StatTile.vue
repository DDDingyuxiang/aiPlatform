<script setup lang="ts">
import Icon from '../Icon.vue'
import type { IconName } from '../icon-registry'

withDefaults(
  defineProps<{
    icon: IconName
    label: string
    /** 已格式化好的展示值 */
    value: string
    tone?: 'primary' | 'warning' | 'info' | 'success'
  }>(),
  { tone: 'primary' },
)
</script>

<template>
  <article class="stat">
    <span class="stat__icon" :class="`stat__icon--${tone}`">
      <Icon :name="icon" :size="19" />
    </span>
    <div class="stat__body">
      <!-- 大号数值使用比例数字（tabular-nums 仅用于需要纵向对齐的表格/坐标轴） -->
      <p class="stat__value">{{ value }}</p>
      <p class="stat__label">{{ label }}</p>
    </div>
    <div v-if="$slots.hint" class="stat__hint">
      <slot name="hint" />
    </div>
  </article>
</template>

<style scoped>
.stat {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
  transition:
    transform var(--duration-fast) var(--ease-out),
    box-shadow var(--duration-fast) var(--ease-standard);
}

.stat:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

.stat__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  flex-shrink: 0;
}

.stat__icon--primary {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

.stat__icon--warning {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}

.stat__icon--info {
  background: var(--color-info-soft);
  color: var(--color-info);
}

.stat__icon--success {
  background: var(--color-success-soft);
  color: var(--color-success);
}

.stat__body {
  min-width: 0;
}

.stat__value {
  font-size: var(--font-2xl);
  font-weight: var(--weight-semibold);
  line-height: 1.15;
  color: var(--color-text-1);
}

.stat__label {
  margin-top: 2px;
  font-size: var(--font-sm);
  color: var(--color-text-3);
}

.stat__hint {
  margin-left: auto;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: var(--font-xs);
  color: var(--color-text-3);
}
</style>
