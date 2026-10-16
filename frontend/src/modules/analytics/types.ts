/** 经营分析类型（与后端 analytics 模块的契约保持一致） */

export type AnalyticsRange = 'd7' | 'd30' | 'quarter' | 'year'

export interface AnalyticsKpi {
  key: 'revenue' | 'orders' | 'satisfaction' | 'collection'
  value: number
  format: 'wan' | 'number' | 'percent'
  delta: { direction: 'up' | 'down'; text: string }
}

/** 收入与成本趋势点（金额单位：万元） */
export interface TrendPoint {
  label: string
  revenue: number
  cost: number
}

/** 本期 vs 上期对比桶（同一度量、不同时间 → 同色系深浅） */
export interface CompareBucket {
  label: string
  current: number
  previous: number
}

export interface DeptRankItem {
  name: string
  value: number
}

export interface CostBreakdownItem {
  key: 'hr' | 'ops' | 'marketing' | 'rd' | 'other'
  value: number
}

/** AI 经营洞察（真实环境由 AI 能力层生成，展示需标注来源） */
export interface AnalyticsInsight {
  id: string
  tone: 'info' | 'warning' | 'positive'
  text: string
}

export interface MetricRow {
  key: string
  current: string
  previous: string
  /** 环比变化（百分点或百分比） */
  change: number
}

export interface AnalyticsOverview {
  range: AnalyticsRange
  kpis: AnalyticsKpi[]
  trend: TrendPoint[]
  compare: CompareBucket[]
  departments: DeptRankItem[]
  costBreakdown: CostBreakdownItem[]
  insights: AnalyticsInsight[]
  metrics: MetricRow[]
}
