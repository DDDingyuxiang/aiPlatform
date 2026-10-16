<script setup lang="ts">
/**
 * 本期 vs 上期分组柱状图（同一度量、不同时间 → 同色两档深浅，不占用分类色槽）。
 * 交互：整段命中区域悬浮显示双值提示（命中区域大于柱体本身）。
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useThemeTokens } from '@/core/theme'
import { axisTicks, formatTickValue, niceCeil, roundedTopRect } from './chart-utils'
import type { CompareBucket } from '../../types'

const props = defineProps<{
  buckets: CompareBucket[]
  currentLabel: string
  previousLabel: string
  unitLabel: string
}>()

const { locale } = useI18n()

const tokens = useThemeTokens([
  '--chart-1',
  '--chart-grid',
  '--chart-axis',
  '--color-surface',
  '--color-text-1',
  '--color-text-2',
  '--color-surface-2',
])

const W = 760
const H = 240
const MARGIN = { top: 18, right: 20, bottom: 28, left: 52 }
const COL_W = 16
const COL_GAP = 2

const hoverIndex = ref<number | null>(null)

const yMax = computed(() => {
  const max = Math.max(...props.buckets.flatMap((bucket) => [bucket.current, bucket.previous]), 1)
  return niceCeil(max * 1.12)
})

const ticks = computed(() => axisTicks(yMax.value))

const plotW = W - MARGIN.left - MARGIN.right
const plotH = H - MARGIN.top - MARGIN.bottom
const baselineY = MARGIN.top + plotH
const bandW = computed(() => plotW / Math.max(1, props.buckets.length))

function barHeight(value: number): number {
  return (Math.max(0, value) / yMax.value) * plotH
}

function groupX(index: number): number {
  const groupW = COL_W * 2 + COL_GAP
  return MARGIN.left + index * bandW.value + (bandW.value - groupW) / 2
}

function tickLabel(value: number): string {
  return formatTickValue(value, locale.value)
}

function valueLabel(value: number): string {
  return `${formatTickValue(value, locale.value)} ${props.unitLabel}`
}

const hoverBucket = computed(() =>
  hoverIndex.value === null ? null : (props.buckets[hoverIndex.value] ?? null),
)

const tooltipStyle = computed(() => {
  if (hoverIndex.value === null) return {}
  const center = MARGIN.left + hoverIndex.value * bandW.value + bandW.value / 2
  return { left: `${Math.min(86, Math.max(14, (center / W) * 100))}%` }
})
</script>

<template>
  <div class="compare">
    <div class="compare__legend">
      <span class="compare__legend-item">
        <span class="compare__legend-swatch" :style="{ background: tokens['--chart-1'] }" />
        {{ currentLabel }}
      </span>
      <span class="compare__legend-item">
        <span
          class="compare__legend-swatch"
          :style="{ background: tokens['--chart-1'], opacity: 0.35 }"
        />
        {{ previousLabel }}
      </span>
    </div>

    <div class="compare__canvas">
      <svg
        :viewBox="`0 0 ${W} ${H}`"
        class="compare__svg"
        role="img"
        :aria-label="`${currentLabel} / ${previousLabel}`"
      >
        <!-- 网格与刻度 -->
        <line
          v-for="tick in ticks"
          :key="tick"
          :x1="MARGIN.left"
          :x2="W - MARGIN.right"
          :y1="MARGIN.top + plotH * (1 - tick / yMax)"
          :y2="MARGIN.top + plotH * (1 - tick / yMax)"
          :stroke="tokens['--chart-grid']"
          stroke-width="1"
        />
        <text
          v-for="tick in ticks"
          :key="`label-${tick}`"
          :x="MARGIN.left - 8"
          :y="MARGIN.top + plotH * (1 - tick / yMax) + 4"
          text-anchor="end"
          class="compare__tick"
          :fill="tokens['--chart-axis']"
        >
          {{ tickLabel(tick) }}
        </text>

        <!-- 悬浮段背景（命中区域大于柱体） -->
        <rect
          v-if="hoverIndex !== null"
          :x="MARGIN.left + hoverIndex * bandW"
          :y="MARGIN.top"
          :width="bandW"
          :height="plotH"
          :fill="tokens['--color-surface-2']"
          opacity="0.7"
        />

        <!-- 分组柱：2px 表面间隙分隔本期/上期，顶部 4px 圆角 -->
        <g v-for="(bucket, index) in buckets" :key="bucket.label">
          <path
            :d="roundedTopRect(groupX(index), baselineY - barHeight(bucket.current), COL_W, barHeight(bucket.current))"
            :fill="tokens['--chart-1']"
            :opacity="hoverIndex === null || hoverIndex === index ? 1 : 0.85"
          />
          <path
            :d="
              roundedTopRect(
                groupX(index) + COL_W + COL_GAP,
                baselineY - barHeight(bucket.previous),
                COL_W,
                barHeight(bucket.previous),
              )
            "
            :fill="tokens['--chart-1']"
            opacity="0.35"
          />
          <text
            :x="groupX(index) + COL_W + COL_GAP / 2"
            :y="H - 8"
            text-anchor="middle"
            class="compare__tick"
            :fill="tokens['--chart-axis']"
          >
            {{ bucket.label }}
          </text>
          <!-- 命中层（覆盖整段） -->
          <rect
            :x="MARGIN.left + index * bandW"
            :y="MARGIN.top"
            :width="bandW"
            :height="plotH"
            fill="transparent"
            @pointerenter="hoverIndex = index"
            @pointerleave="hoverIndex = null"
          />
        </g>
      </svg>

      <div v-if="hoverBucket" class="compare__tooltip" :style="tooltipStyle">
        <p class="compare__tooltip-label">{{ hoverBucket.label }}</p>
        <p class="compare__tooltip-row">
          <span class="compare__tooltip-key" :style="{ background: tokens['--chart-1'] }" />
          <strong>{{ valueLabel(hoverBucket.current) }}</strong>
          <span>{{ currentLabel }}</span>
        </p>
        <p class="compare__tooltip-row">
          <span
            class="compare__tooltip-key"
            :style="{ background: tokens['--chart-1'], opacity: 0.35 }"
          />
          <span class="compare__tooltip-value">{{ valueLabel(hoverBucket.previous) }}</span>
          <span>{{ previousLabel }}</span>
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.compare {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.compare__legend {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding-left: 52px;
}

.compare__legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-xs);
  color: var(--color-text-2);
}

.compare__legend-swatch {
  width: 10px;
  height: 10px;
  border-radius: 3px;
}

.compare__canvas {
  position: relative;
}

.compare__svg {
  display: block;
  width: 100%;
  height: auto;
}

.compare__tick {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

/* ---- 提示框 ---- */
.compare__tooltip {
  position: absolute;
  top: 2px;
  transform: translateX(-50%);
  min-width: 148px;
  padding: 8px 10px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  pointer-events: none;
  z-index: var(--z-dropdown);
}

.compare__tooltip-label {
  margin-bottom: 4px;
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

.compare__tooltip-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-xs);
  color: var(--color-text-2);
}

.compare__tooltip-row + .compare__tooltip-row {
  margin-top: 2px;
}

.compare__tooltip-row strong {
  font-size: var(--font-sm);
  color: var(--color-text-1);
  font-variant-numeric: tabular-nums;
}

.compare__tooltip-value {
  font-variant-numeric: tabular-nums;
}

.compare__tooltip-key {
  width: 12px;
  height: 2px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}
</style>
