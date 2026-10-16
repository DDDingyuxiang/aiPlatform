<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/shared/components/Icon.vue'
import type { IconName } from '@/shared/components/icon-registry'
import BaseButton from '@/shared/components/base/BaseButton.vue'
import BaseCard from '@/shared/components/base/BaseCard.vue'
import BaseTag from '@/shared/components/base/BaseTag.vue'
import StatTile from '@/shared/components/app/StatTile.vue'
import CompareChart from './components/charts/CompareChart.vue'
import DonutChart from './components/charts/DonutChart.vue'
import RankBarChart from './components/charts/RankBarChart.vue'
import TrendChart from './components/charts/TrendChart.vue'
import { useAnalyticsStore } from './store'
import type { AnalyticsKpi, AnalyticsRange } from './types'
import { formatNumber } from '@/shared/utils/format'
import { toast } from '@/shared/composables/useToast'

const { t, locale } = useI18n()
const analytics = useAnalyticsStore()

const RANGES: AnalyticsRange[] = ['d7', 'd30', 'quarter', 'year']

onMounted(() => {
  if (!analytics.overview) void analytics.load('d30')
})

function setRange(range: AnalyticsRange): void {
  if (range !== analytics.range) void analytics.load(range)
}

const overview = computed(() => analytics.overview)

/** 重新取数时保留上一帧（降透明度），不做骨架闪烁 */
const refetching = computed(() => analytics.loading && !!analytics.overview)

const KPI_META: Record<AnalyticsKpi['key'], { icon: IconName; tone: 'primary' | 'info' | 'success' | 'warning' }> = {
  revenue: { icon: 'trending-up', tone: 'primary' },
  orders: { icon: 'tasks', tone: 'info' },
  satisfaction: { icon: 'check-circle', tone: 'success' },
  collection: { icon: 'expense', tone: 'warning' },
}

function kpiDisplay(kpi: AnalyticsKpi): string {
  if (kpi.format === 'percent') return `${kpi.value}%`
  if (kpi.format === 'wan') {
    return formatNumber(kpi.value, locale.value, { maximumFractionDigits: 1 })
  }
  return formatNumber(kpi.value, locale.value)
}

const unitWan = computed(() => t('intel.analytics.unitWan'))

const INSIGHT_DOT: Record<'info' | 'warning' | 'positive', string> = {
  info: 'var(--color-info)',
  warning: 'var(--color-warning)',
  positive: 'var(--color-success)',
}

function onExport(): void {
  toast.success(t('intel.analytics.exported'))
}
</script>

<template>
  <div class="analytics">
    <header class="analytics__hero">
      <div>
        <h2 class="analytics__title">{{ t('nav.analytics') }}</h2>
        <p class="analytics__subtitle">{{ t('intel.analytics.subtitle') }}</p>
      </div>
    </header>

    <!-- 筛选行：位于所有图表之上，统一作用于下方全部内容 -->
    <div class="analytics__filters">
      <div class="analytics__range" role="tablist">
        <button
          v-for="range in RANGES"
          :key="range"
          class="analytics__range-btn"
          :class="{ 'analytics__range-btn--active': analytics.range === range }"
          role="tab"
          :aria-selected="analytics.range === range"
          @click="setRange(range)"
        >
          {{ t(`intel.analytics.range.${range}`) }}
        </button>
      </div>
      <BaseButton size="sm" @click="onExport">
        <template #icon><Icon name="download" :size="14" /></template>
        {{ t('intel.analytics.export') }}
      </BaseButton>
    </div>

    <div v-if="overview" class="analytics__body" :class="{ 'analytics__body--refetching': refetching }">
      <!-- KPI -->
      <div class="analytics__kpis">
        <StatTile
          v-for="kpi in overview.kpis"
          :key="kpi.key"
          :icon="KPI_META[kpi.key].icon"
          :tone="KPI_META[kpi.key].tone"
          :label="t(`intel.analytics.kpi.${kpi.key}`)"
          :value="kpiDisplay(kpi)"
        >
          <template #hint>
            <Icon
              :name="kpi.delta.direction === 'up' ? 'trending-up' : 'trending-down'"
              :size="13"
            />
            <span class="u-tabular">{{ kpi.delta.text }}</span>
          </template>
        </StatTile>
      </div>

      <div class="analytics__grid">
        <BaseCard class="analytics__trend" :title="t('intel.analytics.charts.trend')" :subtitle="unitWan">
          <TrendChart
            :points="overview.trend"
            :revenue-label="t('intel.analytics.charts.trendRevenue')"
            :cost-label="t('intel.analytics.charts.trendCost')"
            :unit-label="unitWan"
          />
        </BaseCard>

        <BaseCard class="analytics__compare" :title="t('intel.analytics.charts.compare')" :subtitle="unitWan">
          <CompareChart
            :buckets="overview.compare"
            :current-label="t('intel.analytics.charts.current')"
            :previous-label="t('intel.analytics.charts.previous')"
            :unit-label="unitWan"
          />
        </BaseCard>

        <BaseCard class="analytics__insights" :title="t('intel.analytics.insights.title')">
          <template #actions>
            <BaseTag tone="ai">
              <Icon name="sparkles" :size="12" />
              <span>{{ t('common.ai.generated') }}</span>
            </BaseTag>
          </template>
          <ul class="analytics__insight-list">
            <li v-for="insight in overview.insights" :key="insight.id" class="analytics__insight">
              <span class="analytics__insight-dot" :style="{ background: INSIGHT_DOT[insight.tone] }" />
              <p class="analytics__insight-text">{{ insight.text }}</p>
            </li>
          </ul>
          <p class="analytics__disclaimer">{{ t('intel.analytics.insights.disclaimer') }}</p>
        </BaseCard>

        <BaseCard class="analytics__rank" :title="t('intel.analytics.charts.departments')" :subtitle="unitWan">
          <RankBarChart :items="overview.departments" :unit-label="unitWan" />
        </BaseCard>

        <BaseCard class="analytics__cost" :title="t('intel.analytics.charts.cost')" :subtitle="unitWan">
          <DonutChart
            :items="overview.costBreakdown"
            :total-label="t('intel.analytics.charts.costTotal')"
            :unit-label="unitWan"
            :label-for="(key) => t(`intel.analytics.cost.${key}`)"
          />
        </BaseCard>

        <!-- 表格视图：所有关键指标数值的等效可达形式 -->
        <BaseCard class="analytics__metrics" :title="t('intel.analytics.metrics.title')" padding="none">
          <table class="metrics-table">
            <thead>
              <tr>
                <th scope="col">{{ t('intel.analytics.metrics.name') }}</th>
                <th scope="col" class="metrics-table__num">{{ t('intel.analytics.metrics.current') }}</th>
                <th scope="col" class="metrics-table__num">{{ t('intel.analytics.metrics.previous') }}</th>
                <th scope="col" class="metrics-table__num">{{ t('intel.analytics.metrics.change') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="metric in overview.metrics" :key="metric.key">
                <td>{{ t(`intel.analytics.kpi.${metric.key}`) }}</td>
                <td class="metrics-table__num u-tabular">{{ metric.current }}</td>
                <td class="metrics-table__num u-tabular">{{ metric.previous }}</td>
                <td
                  class="metrics-table__num u-tabular"
                  :class="metric.change >= 0 ? 'metrics-table__up' : 'metrics-table__down'"
                >
                  {{ metric.change >= 0 ? '+' : '' }}{{ metric.change }}%
                </td>
              </tr>
            </tbody>
          </table>
        </BaseCard>
      </div>
    </div>

    <!-- 首次加载占位（无旧数据可保留时） -->
    <div v-else class="analytics__loading">{{ t('common.loading') }}</div>
  </div>
</template>

<style scoped>
.analytics {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.analytics__hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.analytics__title {
  font-size: var(--font-2xl);
  font-weight: var(--weight-semibold);
  color: var(--color-text-1);
}

.analytics__subtitle {
  margin-top: 6px;
  font-size: var(--font-md);
  color: var(--color-text-2);
}

/* ---- 筛选行 ---- */
.analytics__filters {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.analytics__range {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  background: var(--color-surface-3);
  border-radius: var(--radius-md);
}

.analytics__range-btn {
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  font-size: var(--font-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text-2);
  transition:
    background-color var(--duration-fast) var(--ease-standard),
    color var(--duration-fast) var(--ease-standard);
}

.analytics__range-btn--active {
  background: var(--color-surface);
  color: var(--color-text-1);
  box-shadow: var(--shadow-xs);
}

/* ---- 内容 ---- */
.analytics__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  transition: opacity var(--duration-base) var(--ease-standard);
}

/* 重新取数时保留旧帧 */
.analytics__body--refetching {
  opacity: 0.55;
}

.analytics__kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-4);
}

.analytics__grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: var(--space-4);
}

.analytics__trend,
.analytics__metrics {
  grid-column: span 12;
}

.analytics__compare {
  grid-column: span 7;
}

.analytics__insights {
  grid-column: span 5;
}

.analytics__rank {
  grid-column: span 7;
}

.analytics__cost {
  grid-column: span 5;
}

/* ---- AI 洞察 ---- */
.analytics__insight-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.analytics__insight {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}

.analytics__insight-dot {
  width: 7px;
  height: 7px;
  margin-top: 7px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

.analytics__insight-text {
  font-size: var(--font-sm);
  line-height: 1.65;
  color: var(--color-text-2);
}

.analytics__disclaimer {
  margin-top: var(--space-4);
  padding-top: var(--space-3);
  border-top: 1px dashed var(--color-border);
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

/* ---- 指标表 ---- */
.metrics-table {
  width: 100%;
  font-size: var(--font-sm);
}

.metrics-table th,
.metrics-table td {
  padding: 10px var(--space-4);
  text-align: left;
}

.metrics-table thead th {
  font-size: var(--font-xs);
  font-weight: var(--weight-medium);
  color: var(--color-text-3);
  background: var(--color-surface-2);
  border-bottom: 1px solid var(--color-border);
}

.metrics-table tbody tr + tr td {
  border-top: 1px solid var(--color-border);
}

.metrics-table td {
  color: var(--color-text-1);
}

.metrics-table__num {
  text-align: right !important;
}

.metrics-table__up {
  color: var(--color-success-text);
}

.metrics-table__down {
  color: var(--color-danger-text);
}

.analytics__loading {
  padding: var(--space-9);
  text-align: center;
  font-size: var(--font-sm);
  color: var(--color-text-3);
}

/* ---- 响应式 ---- */
@media (max-width: 1279px) {
  .analytics__kpis {
    grid-template-columns: repeat(2, 1fr);
  }

  .analytics__compare,
  .analytics__insights,
  .analytics__rank,
  .analytics__cost {
    grid-column: span 12;
  }
}

@media (max-width: 640px) {
  .analytics__kpis {
    grid-template-columns: 1fr;
  }
}
</style>
