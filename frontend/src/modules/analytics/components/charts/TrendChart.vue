<script setup lang="ts">
/**
 * 审批提交与处理趋势图（双序列折线 + 提交量面积淡洗）。
 * 交互：十字准线吸附最近数据点，一个提示框列出全部序列（键盘 ←/→ 等效）。
 * 序列色固定取槽位 1、2（dataviz：固定色序），文字一律使用文本令牌。
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useThemeTokens } from '@/core/theme'
import { areaPath, axisTicks, formatTickValue, linePath, niceCeil } from './chart-utils'
import type { TrendPoint } from '../../types'

const props = defineProps<{
  points: TrendPoint[]
  submittedLabel: string
  processedLabel: string
  unitLabel: string
}>()

const { locale } = useI18n()

const tokens = useThemeTokens([
  '--chart-1',
  '--chart-2',
  '--chart-grid',
  '--chart-axis',
  '--color-surface',
  '--color-text-1',
  '--color-text-2',
])

const W = 760
const H = 250
const MARGIN = { top: 18, right: 20, bottom: 28, left: 52 }

const hoverIndex = ref<number | null>(null)

const yMax = computed(() => {
  const max = Math.max(...props.points.flatMap((point) => [point.submitted, point.processed]), 1)
  return niceCeil(max * 1.1)
})

const ticks = computed(() => axisTicks(yMax.value))

const plotW = W - MARGIN.left - MARGIN.right
const plotH = H - MARGIN.top - MARGIN.bottom

function xAt(index: number): number {
  const count = props.points.length
  if (count <= 1) return MARGIN.left + plotW / 2
  return MARGIN.left + (index / (count - 1)) * plotW
}

function yAt(value: number): number {
  return MARGIN.top + plotH * (1 - value / yMax.value)
}

const submittedPoints = computed(() =>
  props.points.map((point, index) => ({ x: xAt(index), y: yAt(point.submitted) })),
)
const processedPoints = computed(() =>
  props.points.map((point, index) => ({ x: xAt(index), y: yAt(point.processed) })),
)

const submittedLine = computed(() => linePath(submittedPoints.value))
const processedLine = computed(() => linePath(processedPoints.value))
const submittedArea = computed(() => areaPath(submittedPoints.value, MARGIN.top + plotH))

/** X 轴标签抽样展示，避免碰撞 */
const xLabels = computed(() => {
  const count = props.points.length
  const step = Math.max(1, Math.ceil(count / 7))
  return props.points
    .map((point, index) => ({ point, index }))
    .filter(({ index }) => index % step === 0 || index === count - 1)
})

/** 端点直接标注（选择性：只标末点；两值靠近时微调避免重叠） */
const endLabels = computed(() => {
  const count = props.points.length
  const last = props.points[count - 1]
  if (!last || count < 2) return []
  const submittedY = yAt(last.submitted)
  const processedY = yAt(last.processed)
  const overlapNudge = 13
  let submittedLabelY = submittedY - 8
  let processedLabelY = processedY - 8
  if (Math.abs(submittedLabelY - processedLabelY) < overlapNudge) {
    if (submittedY <= processedY) {
      submittedLabelY = submittedY - 8
      processedLabelY = processedY + 14
    } else {
      submittedLabelY = submittedY + 14
      processedLabelY = processedY - 8
    }
  }
  return [
    { key: 'submitted', x: xAt(count - 1), y: submittedLabelY, value: last.submitted },
    { key: 'processed', x: xAt(count - 1), y: processedLabelY, value: last.processed },
  ]
})

function tickLabel(value: number): string {
  return formatTickValue(value, locale.value)
}

function valueLabel(value: number): string {
  return `${formatTickValue(value, locale.value)} ${props.unitLabel}`
}

function onPointerMove(event: PointerEvent): void {
  const svg = event.currentTarget as SVGSVGElement
  const rect = svg.getBoundingClientRect()
  const x = ((event.clientX - rect.left) / rect.width) * W
  const count = props.points.length
  if (count <= 1) {
    hoverIndex.value = 0
    return
  }
  const ratio = (x - MARGIN.left) / plotW
  hoverIndex.value = Math.min(count - 1, Math.max(0, Math.round(ratio * (count - 1))))
}

function onKeydown(event: KeyboardEvent): void {
  const count = props.points.length
  if (count === 0) return
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    hoverIndex.value = Math.min(count - 1, (hoverIndex.value ?? -1) + 1)
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    hoverIndex.value = Math.max(0, (hoverIndex.value ?? count) - 1)
  } else if (event.key === 'Escape') {
    hoverIndex.value = null
  }
}

const hoverPoint = computed(() => {
  if (hoverIndex.value === null) return null
  return props.points[hoverIndex.value] ?? null
})

const hoverX = computed(() => (hoverIndex.value === null ? 0 : xAt(hoverIndex.value)))

/** 提示框水平位置（百分比），两端收窄避免溢出 */
const tooltipStyle = computed(() => {
  const left = (hoverX.value / W) * 100
  return { left: `${Math.min(88, Math.max(12, left))}%` }
})
</script>

<template>
  <div class="trend">
    <!-- 图例：双序列必备（线形键 + 文本令牌） -->
    <div class="trend__legend">
      <span class="trend__legend-item">
        <span class="trend__legend-line" :style="{ background: tokens['--chart-1'] }" />
        {{ submittedLabel }}
      </span>
      <span class="trend__legend-item">
        <span class="trend__legend-line" :style="{ background: tokens['--chart-2'] }" />
        {{ processedLabel }}
      </span>
    </div>

    <div class="trend__canvas">
      <svg
        :viewBox="`0 0 ${W} ${H}`"
        class="trend__svg"
        tabindex="0"
        role="img"
        :aria-label="`${submittedLabel} / ${processedLabel}`"
        @pointermove="onPointerMove"
        @pointerleave="hoverIndex = null"
        @keydown="onKeydown"
        @blur="hoverIndex = null"
      >
        <!-- 网格：1px 实线、一步之隔的灰 -->
        <g>
          <line
            v-for="tick in ticks"
            :key="tick"
            :x1="MARGIN.left"
            :x2="W - MARGIN.right"
            :y1="yAt(tick)"
            :y2="yAt(tick)"
            :stroke="tokens['--chart-grid']"
            stroke-width="1"
          />
        </g>
        <!-- Y 轴刻度（表格数字对齐列） -->
        <g>
          <text
            v-for="tick in ticks"
            :key="`label-${tick}`"
            :x="MARGIN.left - 8"
            :y="yAt(tick) + 4"
            text-anchor="end"
            class="trend__tick"
            :fill="tokens['--chart-axis']"
          >
            {{ tickLabel(tick) }}
          </text>
        </g>
        <!-- X 轴标签 -->
        <g>
          <text
            v-for="{ point, index } in xLabels"
            :key="`x-${index}`"
            :x="xAt(index)"
            :y="H - 8"
            text-anchor="middle"
            class="trend__tick"
            :fill="tokens['--chart-axis']"
          >
            {{ point.label }}
          </text>
        </g>

        <!-- 提交量面积淡洗（10% 一档） -->
        <path :d="submittedArea" :fill="tokens['--chart-1']" opacity="0.1" />
        <!-- 折线：2px 圆角连接 -->
        <path
          :d="submittedLine"
          fill="none"
          :stroke="tokens['--chart-1']"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
        <path
          :d="processedLine"
          fill="none"
          :stroke="tokens['--chart-2']"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
        />

        <!-- 十字准线 -->
        <line
          v-if="hoverPoint"
          :x1="hoverX"
          :x2="hoverX"
          :y1="MARGIN.top"
          :y2="MARGIN.top + plotH"
          :stroke="tokens['--chart-axis']"
          stroke-width="1"
        />
        <!-- 悬浮点（2px 表面色描边环） -->
        <template v-if="hoverPoint">
          <circle
            :cx="hoverX"
            :cy="yAt(hoverPoint.submitted)"
            r="4.5"
            :fill="tokens['--chart-1']"
            :stroke="tokens['--color-surface']"
            stroke-width="2"
          />
          <circle
            :cx="hoverX"
            :cy="yAt(hoverPoint.processed)"
            r="4.5"
            :fill="tokens['--chart-2']"
            :stroke="tokens['--color-surface']"
            stroke-width="2"
          />
        </template>

        <!-- 末点标记（≥8px 直径 + 表面色环） -->
        <template v-if="points.length > 1">
          <circle
            :cx="xAt(points.length - 1)"
            :cy="yAt(points[points.length - 1]?.submitted ?? 0)"
            r="4.5"
            :fill="tokens['--chart-1']"
            :stroke="tokens['--color-surface']"
            stroke-width="2"
          />
          <circle
            :cx="xAt(points.length - 1)"
            :cy="yAt(points[points.length - 1]?.processed ?? 0)"
            r="4.5"
            :fill="tokens['--chart-2']"
            :stroke="tokens['--color-surface']"
            stroke-width="2"
          />
        </template>

        <!-- 末点直接标注（选择性标注：只标端点） -->
        <g>
          <text
            v-for="label in endLabels"
            :key="label.key"
            :x="Math.min(label.x, W - MARGIN.right - 4)"
            :y="label.y"
            text-anchor="end"
            class="trend__end-label"
            :fill="tokens['--color-text-2']"
          >
            {{ valueLabel(label.value) }}
          </text>
        </g>
      </svg>

      <!-- 提示框：值为主、序列名为辅 -->
      <div v-if="hoverPoint" class="trend__tooltip" :style="tooltipStyle">
        <p class="trend__tooltip-label">{{ hoverPoint.label }}</p>
        <p class="trend__tooltip-row">
          <span class="trend__tooltip-key" :style="{ background: tokens['--chart-1'] }" />
          <strong>{{ valueLabel(hoverPoint.submitted) }}</strong>
          <span>{{ submittedLabel }}</span>
        </p>
        <p class="trend__tooltip-row">
          <span class="trend__tooltip-key" :style="{ background: tokens['--chart-2'] }" />
          <strong>{{ valueLabel(hoverPoint.processed) }}</strong>
          <span>{{ processedLabel }}</span>
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.trend {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.trend__legend {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding-left: 52px;
}

.trend__legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-xs);
  color: var(--color-text-2);
}

.trend__legend-line {
  width: 14px;
  height: 2px;
  border-radius: var(--radius-full);
}

.trend__canvas {
  position: relative;
}

.trend__svg {
  display: block;
  width: 100%;
  height: auto;
  outline: none;
}

.trend__svg:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

.trend__tick {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.trend__end-label {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

/* ---- 提示框 ---- */
.trend__tooltip {
  position: absolute;
  top: 4px;
  transform: translateX(-50%);
  min-width: 150px;
  padding: 8px 10px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  pointer-events: none;
  z-index: var(--z-dropdown);
}

.trend__tooltip-label {
  margin-bottom: 4px;
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

.trend__tooltip-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-xs);
  color: var(--color-text-2);
}

.trend__tooltip-row + .trend__tooltip-row {
  margin-top: 2px;
}

.trend__tooltip-row strong {
  font-size: var(--font-sm);
  color: var(--color-text-1);
  font-variant-numeric: tabular-nums;
}

.trend__tooltip-key {
  width: 12px;
  height: 2px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}
</style>
