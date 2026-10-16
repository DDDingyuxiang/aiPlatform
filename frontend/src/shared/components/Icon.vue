<script setup lang="ts">
import { computed } from 'vue'
import { ICONS, type IconName } from './icon-registry'

const props = withDefaults(
  defineProps<{
    name: IconName
    /** 像素尺寸（同时作用于宽高） */
    size?: number | string
    /** 描边粗细，默认 1.7；小尺寸下可适当调粗 */
    strokeWidth?: number
  }>(),
  { size: 20, strokeWidth: 1.7 },
)

const inner = computed(() => ICONS[props.name] ?? '')
</script>

<template>
  <!-- 图标内容为仓库内静态常量（icon-registry.ts），不含外部输入 -->
  <svg
    class="icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
    v-html="inner"
  />
</template>

<style scoped>
.icon {
  flex-shrink: 0;
}
</style>
