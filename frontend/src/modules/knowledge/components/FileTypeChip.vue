<script setup lang="ts">
import type { DocFileType } from '../types'

withDefaults(defineProps<{ type: DocFileType; size?: 'sm' | 'md' }>(), { size: 'md' })

const LABEL: Record<DocFileType, string> = {
  pdf: 'PDF',
  doc: 'DOC',
  xls: 'XLS',
  ppt: 'PPT',
  img: 'IMG',
  txt: 'TXT',
}
</script>

<template>
  <span class="ftype" :class="[`ftype--${type}`, `ftype--${size}`]">{{ LABEL[type] }}</span>
</template>

<style scoped>
.ftype {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  font-weight: var(--weight-bold);
  letter-spacing: 0.03em;
  flex-shrink: 0;
  user-select: none;
}

.ftype--md {
  width: 36px;
  height: 36px;
  font-size: 10px;
}

.ftype--sm {
  width: 30px;
  height: 30px;
  font-size: 9px;
}

.ftype--pdf {
  background: var(--color-danger-soft);
  color: var(--color-danger-text);
}

.ftype--doc {
  background: var(--color-info-soft);
  color: var(--color-info-text);
}

.ftype--xls {
  background: var(--color-success-soft);
  color: var(--color-success-text);
}

.ftype--ppt {
  background: var(--color-warning-soft);
  color: var(--color-warning-text);
}

.ftype--img {
  background: var(--color-primary-soft);
  color: var(--color-primary-text);
}

.ftype--txt {
  background: var(--color-surface-3);
  color: var(--color-text-2);
}
</style>
