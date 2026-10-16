<script setup lang="ts">
import { computed } from 'vue'
import { initials } from '@/shared/utils/format'

const props = withDefaults(
  defineProps<{
    name: string
    size?: number
    /** circle（个人）| square（群组/机构） */
    shape?: 'circle' | 'square'
  }>(),
  { size: 32, shape: 'circle' },
)

/** 稳定的姓名底色（同名同色），不传递业务含义 */
const PALETTE = ['#6366f1', '#0891b2', '#8b5cf6', '#d97706', '#059669', '#e11d48', '#0284c7', '#0d9488']

const background = computed(() => {
  let hash = 0
  for (const char of props.name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0
  return PALETTE[hash % PALETTE.length]
})

const label = computed(() => initials(props.name))

const sizeStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  fontSize: `${Math.round(props.size * 0.4)}px`,
  background: background.value,
  borderRadius: props.shape === 'square' ? `${Math.round(props.size * 0.28)}px` : '50%',
}))
</script>

<template>
  <span class="avatar" :style="sizeStyle" :title="name" aria-hidden="true">{{ label }}</span>
</template>

<style scoped>
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-weight: var(--weight-medium);
  letter-spacing: 0.02em;
  user-select: none;
  flex-shrink: 0;
}
</style>
