/** analytics 模块公开导出：跨模块仅可经由本文件引用 */
export { useAnalyticsStore } from './store'
export { default as AnalyticsView } from './AnalyticsView.vue'
export type {
  AnalyticsInsight,
  AnalyticsKpi,
  AnalyticsOverview,
  AnalyticsRange,
  ApprovalBreakdownItem,
  CompareBucket,
  DeptRankItem,
  MetricRow,
  TrendPoint,
} from './types'
