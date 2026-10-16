/**
 * 经营分析演示数据（后端 analytics 模块就绪后删除）。
 * 序列使用确定性伪随机生成（同一 range 结果稳定），金额单位为万元。
 */
import type {
  AnalyticsInsight,
  AnalyticsOverview,
  AnalyticsRange,
  CompareBucket,
  CostBreakdownItem,
  DeptRankItem,
  MetricRow,
  TrendPoint,
} from './types'

/** 确定性伪随机（0~1），保证演示数据在刷新前后稳定 */
function noise(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function dayLabel(offsetDays: number): string {
  const date = new Date(Date.now() - offsetDays * 86_400_000)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

/** 单日收入基线（万元），周末略低 */
function dayValue(offsetDays: number, seed: number): { revenue: number; cost: number } {
  const date = new Date(Date.now() - offsetDays * 86_400_000)
  const weekday = date.getDay()
  const weekendFactor = weekday === 0 || weekday === 6 ? 0.62 : 1
  const revenue = (42 + noise(seed) * 14) * weekendFactor
  const cost = (26 + noise(seed + 7.3) * 8) * weekendFactor
  return { revenue: Math.round(revenue * 10) / 10, cost: Math.round(cost * 10) / 10 }
}

function buildDailyTrend(days: number): TrendPoint[] {
  const points: TrendPoint[] = []
  for (let index = days - 1; index >= 0; index -= 1) {
    const value = dayValue(index, index + 3)
    points.push({ label: dayLabel(index), ...value })
  }
  return points
}

function buildMonthlyTrend(): TrendPoint[] {
  const points: TrendPoint[] = []
  const now = new Date()
  for (let index = 11; index >= 0; index -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1)
    const factor = 1 + (11 - index) * 0.03
    points.push({
      label: `${date.getMonth() + 1}月`,
      revenue: Math.round((1080 + noise(index + 5.1) * 260) * factor),
      cost: Math.round((640 + noise(index + 9.7) * 150) * factor),
    })
  }
  return points
}

/** 本期 vs 上期：把当前序列按桶聚合，并与前一等长周期的同桶对比 */
function buildCompare(current: { revenue: number }[], bucketCount: number, labels: string[]): CompareBucket[] {
  const bucketSize = Math.max(1, Math.round(current.length / bucketCount))
  const buckets: CompareBucket[] = []
  for (let index = 0; index < bucketCount; index += 1) {
    const start = index * bucketSize
    const slice = current.slice(start, start + bucketSize)
    if (slice.length === 0) break
    const currentSum = slice.reduce((sum, point) => sum + point.revenue, 0)
    // 上期取 40 天前的等价窗口（演示数据）
    let previousSum = 0
    for (let offset = 0; offset < slice.length; offset += 1) {
      previousSum += dayValue(40 + start + offset, start + offset + 3).revenue
    }
    buckets.push({
      label: labels[index] ?? `T${index + 1}`,
      current: Math.round(currentSum),
      previous: Math.round(previousSum),
    })
  }
  return buckets
}

const COMPARE_BUCKET_LABELS: Record<Exclude<AnalyticsRange, 'd7' | 'year'>, string[]> = {
  d30: ['1-5日', '6-10日', '11-15日', '16-20日', '21-25日', '26-30日'],
  quarter: ['第1周', '第2周', '第3周', '第4周', '第5周', '第6周'],
}

const DEPARTMENTS: DeptRankItem[] = [
  { name: '华东大区', value: 1860 },
  { name: '华南大区', value: 1520 },
  { name: '华北事业部', value: 1240 },
  { name: '渠道合作部', value: 980 },
  { name: '海外事业部', value: 760 },
]

const COST_BREAKDOWN: CostBreakdownItem[] = [
  { key: 'hr', value: 420 },
  { key: 'ops', value: 260 },
  { key: 'marketing', value: 235 },
  { key: 'rd', value: 180 },
  { key: 'other', value: 65 },
]

const INSIGHTS: AnalyticsInsight[] = [
  {
    id: 'an-insight-1',
    tone: 'warning',
    text: '华东大区收入增速环比放缓 3.2 个百分点，建议关注头部客户的续约节奏。',
  },
  {
    id: 'an-insight-2',
    tone: 'positive',
    text: '市场投放 ROI 连续三周提升，本周达到 4.8，高于行业均值约 20%。',
  },
  {
    id: 'an-insight-3',
    tone: 'info',
    text: '人力成本占比 42%，按当前招聘计划下季度将升至 44%，建议提前评估编制。',
  },
]

function buildMetrics(range: AnalyticsRange): MetricRow[] {
  const scale: Record<AnalyticsRange, number> = { d7: 0.24, d30: 1, quarter: 3.1, year: 9.6 }
  const factor = scale[range]
  return [
    { key: 'revenue', current: `${Math.round(1286 * factor).toLocaleString('zh-CN')} 万`, previous: `${Math.round(1164 * factor).toLocaleString('zh-CN')} 万`, change: 10.5 },
    { key: 'orders', current: Math.round(1286 * factor).toLocaleString('zh-CN'), previous: Math.round(1188 * factor).toLocaleString('zh-CN'), change: 8.2 },
    { key: 'satisfaction', current: '94.2%', previous: '93.1%', change: 1.1 },
    { key: 'collection', current: '91.5%', previous: '92.8%', change: -1.3 },
  ]
}

export function buildOverview(range: AnalyticsRange): AnalyticsOverview {
  const trend = range === 'year' ? buildMonthlyTrend() : buildDailyTrend(range === 'd7' ? 7 : 30)

  let compare: CompareBucket[]
  if (range === 'd7') {
    compare = buildCompare(trend, 7, trend.map((point) => point.label))
  } else if (range === 'year') {
    compare = trend.map((point, index) => ({
      label: point.label,
      current: point.revenue,
      previous: Math.round((1080 + noise(index + 9.4) * 240) * (1 + (11 - index) * 0.03)),
    }))
  } else {
    compare = buildCompare(trend, 6, COMPARE_BUCKET_LABELS[range])
  }

  const revenueScale: Record<AnalyticsRange, number> = { d7: 1, d30: 4.3, quarter: 13.2, year: 41 }
  const revenue = Math.round(312.6 * revenueScale[range] * 10) / 10

  return {
    range,
    kpis: [
      { key: 'revenue', value: revenue, format: 'wan', delta: { direction: 'up', text: '+10.5%' } },
      { key: 'orders', value: Math.round(286 * revenueScale[range]), format: 'number', delta: { direction: 'up', text: '+8.2%' } },
      { key: 'satisfaction', value: 94.2, format: 'percent', delta: { direction: 'up', text: '+1.1pt' } },
      { key: 'collection', value: 91.5, format: 'percent', delta: { direction: 'down', text: '-1.3pt' } },
    ],
    trend,
    compare,
    departments: DEPARTMENTS,
    costBreakdown: COST_BREAKDOWN,
    insights: INSIGHTS,
    metrics: buildMetrics(range),
  }
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}
