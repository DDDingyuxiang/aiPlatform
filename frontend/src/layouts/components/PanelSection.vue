<script setup lang="ts">
import { ref } from 'vue'
import Icon from '@/shared/components/Icon.vue'
import type { IconName } from '@/shared/components/icon-registry'

const props = withDefaults(
  defineProps<{
    title: string
    icon: IconName
    /** 标题右侧计数徽标（如未读数） */
    badge?: number
    defaultOpen?: boolean
  }>(),
  { defaultOpen: false },
)

const open = ref(props.defaultOpen)
</script>

<template>
  <section class="p-section">
    <div class="p-section__head">
      <button class="p-section__toggle" :aria-expanded="open" @click="open = !open">
        <Icon :name="icon" :size="16" class="p-section__icon" />
        <span class="p-section__title">{{ title }}</span>
        <span v-if="badge" class="p-section__badge u-tabular">{{ badge > 99 ? '99+' : badge }}</span>
        <Icon
          name="chevron-down"
          :size="15"
          class="p-section__chevron"
          :class="{ 'p-section__chevron--open': open }"
        />
      </button>
      <div v-if="open && $slots.actions" class="p-section__actions">
        <slot name="actions" />
      </div>
    </div>
    <div v-show="open" class="p-section__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.p-section {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
  overflow: hidden;
}

.p-section__head {
  display: flex;
  align-items: center;
}

.p-section__toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  padding: 11px 12px;
  transition: background-color var(--duration-fast) var(--ease-standard);
}

.p-section__toggle:hover {
  background: var(--color-surface-2);
}

.p-section__icon {
  color: var(--color-text-3);
}

.p-section__title {
  flex: 1;
  min-width: 0;
  text-align: left;
  font-size: var(--font-sm);
  font-weight: var(--weight-semibold);
  color: var(--color-text-1);
}

.p-section__badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-full);
  background: var(--color-primary);
  color: var(--color-primary-contrast);
  font-size: 11px;
  line-height: 1;
}

.p-section__chevron {
  color: var(--color-text-3);
  transform: rotate(-90deg);
  transition: transform var(--duration-fast) var(--ease-standard);
}

.p-section__chevron--open {
  transform: rotate(0deg);
}

.p-section__actions {
  padding-right: 8px;
}

.p-section__body {
  padding: 0 12px 12px;
}
</style>
