<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useClickOutside } from '@/shared/composables/useClickOutside'

const props = withDefaults(
  defineProps<{
    /** 面板与触发器的对齐方式 */
    align?: 'start' | 'end'
    width?: number | string
    disabled?: boolean
  }>(),
  { align: 'end' },
)

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

function toggle(): void {
  if (!props.disabled) open.value = !open.value
}

function close(): void {
  open.value = false
}

useClickOutside(rootRef, close)

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && open.value) close()
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div ref="rootRef" class="dropdown">
    <slot name="trigger" :open="open" :toggle="toggle" />
    <Transition name="dropdown">
      <div
        v-if="open"
        class="dropdown__panel"
        :class="`dropdown__panel--${align}`"
        :style="{ minWidth: typeof width === 'number' ? `${width}px` : width }"
        role="menu"
      >
        <slot :close="close" />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.dropdown {
  position: relative;
  display: inline-flex;
}

.dropdown__panel {
  position: absolute;
  top: calc(100% + 8px);
  z-index: var(--z-dropdown);
  min-width: 160px;
  padding: var(--space-1);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.dropdown__panel--end {
  right: 0;
}

.dropdown__panel--start {
  left: 0;
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition:
    opacity var(--duration-fast) var(--ease-standard),
    transform var(--duration-fast) var(--ease-out);
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
</style>
