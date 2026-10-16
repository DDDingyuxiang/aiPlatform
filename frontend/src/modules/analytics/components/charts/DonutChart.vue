<script setup lang="ts">
/**
 * 费用构成环形图（部分-整体，≤6 段；金额在右侧图例中直接可读，不依赖悬浮）。
 * 段与段之间留 2px 表面色间隙；悬浮段高亮，圆环中心显示该段明细。
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useThemeTokens } from '@/core/theme'
import { donutArc } from './chart-utils'
import type { CostBreakdownItem } from '../../types'

const props = defineProps<{
  items: CostBreakdownItem[]
  totalLabel: string
  unitLabel: string
  labelFor: (key: CostBreakdownItem['key']) => string
}>()

const { locale } = useI18n()

const tokens = useThemeTokens(['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--color-surface'])

const SLOT_VARS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'] as const

const SIZE = 200
const CX = SIZE / 2
const CY = SIZE / 2
const OUTER_R = 86
const INNER_R = 58

const hoverKey = ref<CostBreakdownItem['key'] | null>(null)

const total = computed(() => props.items.reduce((sum, item) => sum + item.value, 0))

/** 2px 表面间隙 → 折算为角度 */
const padAngle = computed(() => 2 / OUTER_R)

const segments = computed(() => {
  const sum = Math.max(1, total.value)
  let angle = -Math.PI / 2
  return props.items.map((item, index) => {
    const sweep = (item.value / sum) * Math.PI * 2
    const start = angle
    const end = angle + sweep
    angle = end
    const pad = sweep > padAngle.value * 3 ? padAngle.value / 2 : 0
    const slotVar = SLOT_VARS[index % SLOT_VARS.length] ?? '--chart-1'
    return {
      key: item.key,
      value: item.value,
      color: tokens.value[slotVar] ?? '',
      percent: Math.round((item.value / sum) * 100),
      path: donutArc(CX, CY, OUTER_R, INNER_R, start + pad, end - pad),
    }
  })
})

const hovered = computed(() =>
  hoverKey.value ? (segments.value.find((segment) => segment.key === hoverKey.value) ?? null) : null,
)

function valueLabel(value: number): string {
  return `${new Intl.NumberFormat(locale.value).format(value)} ${props.unitLabel}`
}

const centerValue = computed(() =>
  hovered.value ? valueLabel(hovered.value.value) : valueLabel(total.value),
)

const centerLabel = computed(() => (hovered.value ? props.labelFor(hovered.value.key) : props.totalLabel))
</script>

<template>
  <div class="donut">
    <svg :viewBox="`0 0 ${SIZE} ${SIZE}`" class="donut__svg" role="img" :aria-label="totalLabel">
      <path
        v-for="segment in segments"
        :key="segment.key"
        :d="segment.path"
        :fill="segment.color"
        :opacity="hoverKey === null || hoverKey === segment.key ? 1 : 0.4"
        class="donut__segment"
        @pointerenter="hoverKey = segment.key"
        @pointerleave="hoverKey = null"
      />
      <text x="50%" y="47%" text-anchor="middle" class="donut__center-value">
        {{ centerValue }}
      </text>
      <text x="50%" y="59%" text-anchor="middle" class="donut__center-label">
        {{ centerLabel }}
      </text>
    </svg>

    <!-- 图例即表格视图：金额与占比直接可读 -->
    <ul class="donut__legend">
      <li
        v-for="segment in segments"
        :key="segment.key"
        class="donut__legend-row"
        :class="{ 'donut__legend-row--dim': hoverKey !== null && hoverKey !== segment.key }"
        @pointerenter="hoverKey = segment.key"
        @pointerleave="hoverKey = null"
      >
        <span class="donut__legend-swatch" :style="{ background: segment.color }" />
        <span class="donut__legend-label u-truncate">{{ labelFor(segment.key) }}</span>
        <span class="donut__legend-value u-tabular">{{ valueLabel(segment.value) }}</span>
        <span class="donut__legend-percent u-tabular">{{ segment.percent }}%</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.donut {
  display: flex;
  align-items: center;
  gap: var(--space-5);
  flex-wrap: wrap;
}

.donut__svg {
  width: 180px;
  height: 180px;
  flex-shrink: 0;
}

.donut__segment {
  transition: opacity var(--duration-fast) var(--ease-standard);
  cursor: default;
}

.donut__center-value {
  font-size: 16px;
  font-weight: var(--weight-semibold);
  fill: var(--color-text-1);
}

.donut__center-label {
  font-size: 11px;
  fill: var(--color-text-3);
}

.donut__legend {
  flex: 1;
  min-width: 180px;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.donut__legend-row {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-sm);
  transition: opacity var(--duration-fast) var(--ease-standard);
}

.donut__legend-row--dim {
  opacity: 0.45;
}

.donut__legend-swatch {
  width: 10px;
  height: 10px;
  border-radius: 3px;
}

.donut__legend-label {
  color: var(--color-text-2);
  min-width: 0;
}

.donut__legend-value {
  color: var(--color-text-1);
  white-space: nowrap;
}

.donut__legend-percent {
  width: 38px;
  text-align: right;
  color: var(--color-text-3);
}
</style>
