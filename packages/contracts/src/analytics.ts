/** 经营分析只返回现有业务表能够支持的运营指标，不包含虚构财务数据。 */
import { z } from 'zod'

export const analyticsRangeSchema = z.enum(['d7', 'd30', 'quarter', 'year'])
export type AnalyticsRange = z.infer<typeof analyticsRangeSchema>

export const analyticsKpiSchema = z.object({
  key: z.enum(['approvals', 'pendingApprovals', 'taskCompletion', 'attendance']),
  value: z.number().nonnegative().nullable(),
  format: z.enum(['number', 'percent']),
  delta: z.object({ direction: z.enum(['up', 'down', 'flat']), text: z.string().max(32) }),
})

export const analyticsTrendPointSchema = z.object({
  label: z.string().max(32),
  submitted: z.number().int().nonnegative(),
  processed: z.number().int().nonnegative(),
})

export const analyticsCompareBucketSchema = z.object({
  label: z.string().max(32),
  current: z.number().int().nonnegative(),
  previous: z.number().int().nonnegative(),
})

export const analyticsDepartmentSchema = z.object({
  name: z.string().max(255),
  value: z.number().int().nonnegative(),
})

export const analyticsApprovalBreakdownSchema = z.object({
  key: z.enum(['expense', 'leave', 'purchase', 'contract']),
  value: z.number().int().nonnegative(),
})

export const analyticsInsightSchema = z.object({
  id: z.string().max(64),
  tone: z.enum(['info', 'warning', 'positive']),
  key: z.enum(['pendingApprovals', 'overdueTasks', 'lateAttendance', 'noIssues']),
  value: z.number().int().nonnegative(),
})

export const analyticsMetricSchema = z.object({
  key: z.enum(['approvalCount', 'approvedCount', 'rejectedCount', 'pendingCount']),
  current: z.number().int().nonnegative(),
  previous: z.number().int().nonnegative(),
  change: z.number().nullable(),
})

export const analyticsOverviewSchema = z.object({
  range: analyticsRangeSchema,
  kpis: z.array(analyticsKpiSchema),
  trend: z.array(analyticsTrendPointSchema),
  compare: z.array(analyticsCompareBucketSchema),
  departments: z.array(analyticsDepartmentSchema),
  approvalBreakdown: z.array(analyticsApprovalBreakdownSchema),
  insights: z.array(analyticsInsightSchema),
  metrics: z.array(analyticsMetricSchema),
})
export type AnalyticsOverview = z.infer<typeof analyticsOverviewSchema>
export type AnalyticsKpi = z.infer<typeof analyticsKpiSchema>
export type TrendPoint = z.infer<typeof analyticsTrendPointSchema>
export type CompareBucket = z.infer<typeof analyticsCompareBucketSchema>
export type DeptRankItem = z.infer<typeof analyticsDepartmentSchema>
export type ApprovalBreakdownItem = z.infer<typeof analyticsApprovalBreakdownSchema>
export type AnalyticsInsight = z.infer<typeof analyticsInsightSchema>
export type MetricRow = z.infer<typeof analyticsMetricSchema>
