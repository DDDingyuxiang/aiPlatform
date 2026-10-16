<script setup lang="ts">
import Icon from '../Icon.vue'
import type { IconName } from '../icon-registry'

defineProps<{
  icon?: IconName
  /** 危险操作（如删除、退出） */
  danger?: boolean
  /** 当前选中项（展示右侧对勾） */
  active?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{ click: [] }>()
</script>

<template>
  <button
    class="menu-item"
    :class="{ 'menu-item--danger': danger, 'menu-item--active': active }"
    role="menuitem"
    :disabled="disabled"
    @click="emit('click')"
  >
    <Icon v-if="icon" :name="icon" :size="16" class="menu-item__icon" />
    <span class="menu-item__label"><slot /></span>
    <Icon v-if="active" name="check" :size="14" class="menu-item__check" />
  </button>
</template>

<style scoped>
.menu-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  font-size: var(--font-md);
  color: var(--color-text-1);
  text-align: left;
  transition: background-color var(--duration-fast) var(--ease-standard);
}

.menu-item:hover:not(:disabled) {
  background: var(--color-surface-3);
}

.menu-item--danger {
  color: var(--color-danger-text);
}

.menu-item--danger:hover:not(:disabled) {
  background: var(--color-danger-soft);
}

.menu-item--active {
  color: var(--color-primary-text);
}

.menu-item__icon {
  color: var(--color-text-3);
}

.menu-item--danger .menu-item__icon {
  color: currentColor;
}

.menu-item__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu-item__check {
  color: var(--color-primary);
}

.menu-item:disabled {
  opacity: 0.5;
}
</style>
