/** 显式 Mock 模式使用的运营分析演示数据，不用于真实 API。 */
import type { AnalyticsOverview, AnalyticsRange, TrendPoint } from './types'

function dateLabel(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function buildTrend(range: AnalyticsRange): TrendPoint[] {
  if (range === 'year') {
    return Array.from({ length: 12 }, (_, index) => ({
      label: `${index + 1}月`,
      submitted: 38 + index * 3,
      processed: 34 + index * 2,
    }))
  }
  const length = range === 'd7' ? 7 : range === 'quarter' ? 13 : 30
  const now = new Date()
  return Array.from({ length }, (_, index) => {
    const date = new Date(now)
    date.setDate(date.getDate() - (length - index - 1))
    return {
      label: range === 'quarter' ? `第${index + 1}周` : dateLabel(date),
      submitted: 2 + ((index * 7) % 8),
      processed: 1 + ((index * 5) % 7),
    }
  })
}

export function buildOverview(range: AnalyticsRange): AnalyticsOverview {
  const trend = buildTrend(range)
  const compareLength = range === 'd30' || range === 'quarter' ? 6 : trend.length
  return {
    range,
    kpis: [
      { key: 'approvals', value: 126, format: 'number', delta: { direction: 'up', text: '+8.2%' } },
      { key: 'pendingApprovals', value: 14, format: 'number', delta: { direction: 'down', text: '-2.1%' } },
      { key: 'taskCompletion', value: 78.4, format: 'percent', delta: { direction: 'up', text: '+3.1pt' } },
      { key: 'attendance', value: 96.2, format: 'percent', delta: { direction: 'up', text: '+0.8pt' } },
    ],
    trend,
    compare: Array.from({ length: compareLength }, (_, index) => ({
      label: range === 'year' ? `${index + 1}月` : range === 'd7' ? trend[index]?.label ?? '' : `第${index + 1}段`,
      current: 18 + index * 2,
      previous: 15 + index * 2,
    })),
    departments: [
      { name: '产品部', value: 22 },
      { name: '研发部', value: 18 },
      { name: '销售部', value: 15 },
      { name: '运营部', value: 11 },
      { name: '客服部', value: 8 },
    ],
    approvalBreakdown: [
      { key: 'expense', value: 48 },
      { key: 'leave', value: 36 },
      { key: 'purchase', value: 28 },
      { key: 'contract', value: 14 },
    ],
    insights: [
      { id: 'pending', tone: 'info', key: 'pendingApprovals', value: 14 },
      { id: 'overdue', tone: 'warning', key: 'overdueTasks', value: 5 },
      { id: 'late', tone: 'warning', key: 'lateAttendance', value: 3 },
    ],
    metrics: [
      { key: 'approvalCount', current: 126, previous: 116, change: 8.6 },
      { key: 'approvedCount', current: 98, previous: 92, change: 6.5 },
      { key: 'rejectedCount', current: 14, previous: 12, change: 16.7 },
      { key: 'pendingCount', current: 14, previous: 12, change: 16.7 },
    ],
  }
}
