<script setup lang="ts">
/**
 * 部门业绩排行（横向条形图，单序列取槽位 1 单色）。
 * 数值直接在条形末端标注（不外接坐标轴之外），悬浮高亮并给出原值。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useThemeTokens } from '@/core/theme'
import type { DeptRankItem } from '../../types'

const props = defineProps<{
  items: DeptRankItem[]
  unitLabel: string
}>()

const { locale } = useI18n()

const tokens = useThemeTokens(['--chart-1'])

const sorted = computed(() => [...props.items].sort((a, b) => b.value - a.value))
const max = computed(() => Math.max(...sorted.value.map((item) => item.value), 1))

function percent(value: number): number {
  return Math.max(2, (value / max.value) * 100)
}

function valueLabel(value: number): string {
  return `${new Intl.NumberFormat(locale.value).format(value)} ${props.unitLabel}`
}
</script>

<template>
  <ul class="rank">
    <li v-for="item in sorted" :key="item.name" class="rank__row" :title="`${item.name}：${valueLabel(item.value)}`">
      <span class="rank__name u-truncate">{{ item.name }}</span>
      <span class="rank__track">
        <span
          class="rank__bar"
          :style="{ width: `${percent(item.value)}%`, background: tokens['--chart-1'] }"
        />
      </span>
      <span class="rank__value u-tabular">{{ valueLabel(item.value) }}</span>
    </li>
  </ul>
</template>

<style scoped>
.rank {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.rank__row {
  display: grid;
  grid-template-columns: 88px 1fr 78px;
  align-items: center;
  gap: var(--space-3);
}

.rank__name {
  font-size: var(--font-sm);
  color: var(--color-text-2);
  min-width: 0;
}

.rank__track {
  display: block;
  height: 16px;
}

/* 数据端（右端）4px 圆角，基线端方角 */
.rank__bar {
  display: block;
  height: 100%;
  border-radius: 0 4px 4px 0;
  transition:
    filter var(--duration-fast) var(--ease-standard),
    width var(--duration-slow) var(--ease-out);
}

.rank__row:hover .rank__bar {
  filter: brightness(1.08);
}

.rank__value {
  font-size: var(--font-xs);
  color: var(--color-text-1);
  text-align: right;
  white-space: nowrap;
}

@media (max-width: 640px) {
  .rank__row {
    grid-template-columns: 72px 1fr 70px;
  }
}
</style>
