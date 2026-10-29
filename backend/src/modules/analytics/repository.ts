import type { Pool, RowDataPacket } from 'mysql2/promise'
import type {
  AnalyticsKpi,
  AnalyticsOverview,
  AnalyticsRange,
  AnalyticsInsight,
  MetricRow,
  TrendPoint,
} from '@aiplatform/contracts'
import type { AnalyticsRepository } from './types.js'

interface CountRow extends RowDataPacket {
  period?: 'current' | 'previous'
  status?: string
  count: number | string
}

interface EventRow extends RowDataPacket {
  event_date: Date | string
  event_type: 'submitted' | 'processed'
  count: number | string
}

interface CompareRow extends RowDataPacket {
  event_date: Date | string
  period: 'current' | 'previous'
  count: number | string
}

interface NameCountRow extends RowDataPacket {
  name: string
  count: number | string
}

interface ApprovalTypeRow extends RowDataPacket {
  approval_type: 'expense' | 'leave' | 'purchase' | 'contract'
  count: number | string
}

interface AttendanceRow extends RowDataPacket {
  period?: 'current' | 'previous'
  status: 'normal' | 'late' | 'absent'
  count: number | string
}

interface ScalarRow extends RowDataPacket {
  count: number | string
}

interface RangeWindow {
  start: Date
  end: Date
  previousStart: Date
  previousEnd: Date
}

function addDays(date: Date, amount: number): Date {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + amount)
  return result
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function rangeWindow(range: AnalyticsRange, now = new Date()): RangeWindow {
  const today = startOfUtcDay(now)
  const end = addDays(today, 1)
  let start: Date
  if (range === 'd7') start = addDays(today, -6)
  else if (range === 'd30') start = addDays(today, -29)
  else if (range === 'quarter') {
    start = new Date(Date.UTC(today.getUTCFullYear(), Math.floor(today.getUTCMonth() / 3) * 3, 1))
  } else start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1))
  const duration = end.getTime() - start.getTime()
  const previousStart = range === 'quarter'
    ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 3, 1))
    : range === 'year'
      ? new Date(Date.UTC(start.getUTCFullYear() - 1, 0, 1))
      : new Date(start.getTime() - duration)
  const previousEnd = range === 'quarter'
    ? new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 3, end.getUTCDate()))
    : range === 'year'
      ? new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth(), end.getUTCDate()))
      : start
  return {
    start,
    end,
    previousStart,
    previousEnd,
  }
}

function sqlDate(value: Date): string {
  return value.toISOString().slice(0, 19).replace('T', ' ')
}

function dayKey(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return value.slice(0, 10)
}

function asNumber(value: number | string | undefined): number {
  return Number(value ?? 0)
}

function periodKey(date: string, start: Date, duration: number, buckets: number): number {
  const timestamp = new Date(`${date}T00:00:00.000Z`).getTime()
  return Math.min(buckets - 1, Math.max(0, Math.floor(((timestamp - start.getTime()) / duration) * buckets)))
}

function bucketLabel(range: AnalyticsRange, index: number, start: Date): string {
  if (range === 'year') return `${index + 1}月`
  if (range === 'quarter') return `第${index + 1}周`
  const date = addDays(start, index)
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`
}

function trendBucketIndex(range: AnalyticsRange, date: string, start: Date, bucketCount: number, duration: number): number {
  if (range === 'year') {
    const parsed = new Date(`${date}T00:00:00.000Z`)
    return Math.min(bucketCount - 1, Math.max(0, parsed.getUTCMonth() - start.getUTCMonth()))
  }
  if (range === 'quarter') {
    const timestamp = new Date(`${date}T00:00:00.000Z`).getTime()
    return Math.min(bucketCount - 1, Math.max(0, Math.floor((timestamp - start.getTime()) / 604_800_000)))
  }
  return periodKey(date, start, duration, bucketCount)
}

function percent(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 1000) / 10
}

function changePercent(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

function delta(current: number | null, previous: number | null, percentagePoint = false): AnalyticsKpi['delta'] {
  if (current === null || previous === null) return { direction: 'flat', text: '—' }
  const difference = current - previous
  const direction = difference > 0 ? 'up' : difference < 0 ? 'down' : 'flat'
  if (!percentagePoint && previous === 0 && current > 0) {
    return { direction, text: '—' }
  }
  const text = percentagePoint
    ? `${difference > 0 ? '+' : ''}${Math.round(difference * 10) / 10}pt`
    : `${difference > 0 ? '+' : ''}${Math.round((changePercent(current, previous) ?? 0) * 10) / 10}%`
  return { direction, text }
}

function buildKpi(
  key: AnalyticsKpi['key'],
  value: number | null,
  previous: number | null,
  format: AnalyticsKpi['format'],
  percentagePoint = false,
): AnalyticsKpi {
  return { key, value, format, delta: delta(value, previous, percentagePoint) }
}

function buildMetric(
  key: MetricRow['key'],
  current: number,
  previous: number,
): MetricRow {
  return { key, current, previous, change: changePercent(current, previous) }
}

function groupStatus(rows: CountRow[], period: 'current' | 'previous'): Map<string, number> {
  return new Map(
    rows
      .filter((row) => row.period === period && row.status)
      .map((row) => [row.status!, asNumber(row.count)]),
  )
}

export function createMySqlAnalyticsRepository(pool: Pool): AnalyticsRepository {
  return {
    async overview(tenantId, range) {
      const window = rangeWindow(range)
      const start = sqlDate(window.start)
      const end = sqlDate(window.end)
      const previousStart = sqlDate(window.previousStart)
      const previousEnd = sqlDate(window.previousEnd)

      const [approvalRows, eventRows, taskRows, attendanceRows, departmentRows, typeRows, overdueRows, pendingRows, compareEvents] =
        await Promise.all([
          pool.execute<CountRow[]>(
            `SELECT IF(submitted_at >= ?, 'current', 'previous') AS period,
                    status, COUNT(*) AS count
               FROM approval_instances
              WHERE tenant_id = ? AND deleted_at IS NULL
                AND ((submitted_at >= ? AND submitted_at < ?)
                  OR (submitted_at >= ? AND submitted_at < ?))
              GROUP BY period, status`,
            [start, tenantId, previousStart, previousEnd, start, end],
          ).then(([rows]) => rows),
          pool.execute<EventRow[]>(
            `SELECT event_date, event_type, SUM(count) AS count FROM (
               SELECT DATE(submitted_at) AS event_date, 'submitted' AS event_type, COUNT(*) AS count
                 FROM approval_instances
                WHERE tenant_id = ? AND deleted_at IS NULL AND submitted_at >= ? AND submitted_at < ?
                GROUP BY DATE(submitted_at)
               UNION ALL
               SELECT DATE(finished_at) AS event_date, 'processed' AS event_type, COUNT(*) AS count
                 FROM approval_instances
                WHERE tenant_id = ? AND deleted_at IS NULL AND status IN ('approved', 'rejected')
                  AND finished_at >= ? AND finished_at < ?
                GROUP BY DATE(finished_at)
             ) events GROUP BY event_date, event_type`,
            [tenantId, start, end, tenantId, start, end],
          ).then(([rows]) => rows),
          pool.execute<CountRow[]>(
            `SELECT IF(created_at >= ?, 'current', 'previous') AS period,
                    status, COUNT(*) AS count
               FROM tasks
              WHERE tenant_id = ? AND deleted_at IS NULL
                AND ((created_at >= ? AND created_at < ?)
                  OR (created_at >= ? AND created_at < ?))
              GROUP BY period, status`,
            [start, tenantId, previousStart, previousEnd, start, end],
          ).then(([rows]) => rows),
          pool.execute<AttendanceRow[]>(
            `SELECT IF(work_date >= DATE(?), 'current', 'previous') AS period,
                    status, COUNT(*) AS count
               FROM attendance_records
              WHERE tenant_id = ?
                AND ((work_date >= DATE(?) AND work_date < DATE(?))
                  OR (work_date >= DATE(?) AND work_date < DATE(?)))
              GROUP BY period, status`,
            [start, tenantId, previousStart, previousEnd, start, end],
          ).then(([rows]) => rows),
          pool.execute<NameCountRow[]>(
            `SELECT COALESCE(d.name, '未分配') AS name, COUNT(DISTINCT e.id) AS count
               FROM employees e
               LEFT JOIN employee_department_memberships edm
                 ON edm.tenant_id = e.tenant_id AND edm.employee_id = e.id AND edm.is_primary = 1
               LEFT JOIN departments d
                 ON d.tenant_id = edm.tenant_id AND d.id = edm.department_id AND d.deleted_at IS NULL
              WHERE e.tenant_id = ? AND e.status = 'active' AND e.deleted_at IS NULL
              GROUP BY COALESCE(d.name, '未分配')
              ORDER BY count DESC, name ASC LIMIT 8`,
            [tenantId],
          ).then(([rows]) => rows),
          pool.execute<ApprovalTypeRow[]>(
            `SELECT approval_type, COUNT(*) AS count
               FROM approval_instances
              WHERE tenant_id = ? AND deleted_at IS NULL
                AND submitted_at >= ? AND submitted_at < ?
              GROUP BY approval_type`,
            [tenantId, start, end],
          ).then(([rows]) => rows),
          pool.execute<ScalarRow[]>(
            `SELECT COUNT(*) AS count FROM tasks
              WHERE tenant_id = ? AND deleted_at IS NULL
                AND status <> 'done' AND due_at < UTC_TIMESTAMP(3)`,
            [tenantId],
          ).then(([rows]) => rows),
          pool.execute<ScalarRow[]>(
            `SELECT COUNT(*) AS count FROM approval_instances
              WHERE tenant_id = ? AND deleted_at IS NULL AND status = 'pending'`,
            [tenantId],
          ).then(([rows]) => rows),
          pool.execute<CompareRow[]>(
            `SELECT IF(submitted_at >= ?, 'current', 'previous') AS period,
                    DATE(submitted_at) AS event_date, COUNT(*) AS count
               FROM approval_instances
              WHERE tenant_id = ? AND deleted_at IS NULL
                AND ((submitted_at >= ? AND submitted_at < ?)
                  OR (submitted_at >= ? AND submitted_at < ?))
              GROUP BY period, DATE(submitted_at)`,
            [start, tenantId, previousStart, previousEnd, start, end],
          ).then(([rows]) => rows),
        ])

      const currentApprovals = groupStatus(approvalRows, 'current')
      const previousApprovals = groupStatus(approvalRows, 'previous')
      const currentTasks = groupStatus(taskRows, 'current')
      const previousTasks = groupStatus(taskRows, 'previous')
      const currentAttendance = groupStatus(attendanceRows, 'current')
      const previousAttendance = groupStatus(attendanceRows, 'previous')

      const approvalCount = [...currentApprovals.values()].reduce((sum, value) => sum + value, 0)
      const previousApprovalCount = [...previousApprovals.values()].reduce((sum, value) => sum + value, 0)
      const pendingCount = currentApprovals.get('pending') ?? 0
      const previousPendingCount = previousApprovals.get('pending') ?? 0
      const currentTaskCount = [...currentTasks.values()].reduce((sum, value) => sum + value, 0)
      const previousTaskCount = [...previousTasks.values()].reduce((sum, value) => sum + value, 0)
      const currentTaskCompletion = percent(currentTasks.get('done') ?? 0, currentTaskCount)
      const previousTaskCompletion = percent(previousTasks.get('done') ?? 0, previousTaskCount)
      const currentAttendanceCount = [...currentAttendance.values()].reduce((sum, value) => sum + value, 0)
      const previousAttendanceCount = [...previousAttendance.values()].reduce((sum, value) => sum + value, 0)
      const currentAttendanceRate = percent(currentAttendance.get('normal') ?? 0, currentAttendanceCount)
      const previousAttendanceRate = percent(previousAttendance.get('normal') ?? 0, previousAttendanceCount)

      const bucketCount = range === 'd7' ? 7 : range === 'd30' ? 30 : range === 'quarter' ? 13 : 12
      const duration = window.end.getTime() - window.start.getTime()
      const currentSubmitted = Array<number>(bucketCount).fill(0)
      const currentProcessed = Array<number>(bucketCount).fill(0)
      const currentCompare = Array<number>(range === 'd30' ? 6 : range === 'quarter' ? 6 : bucketCount).fill(0)
      const previousCompare = Array<number>(currentCompare.length).fill(0)
      for (const row of eventRows) {
        const date = dayKey(row.event_date)
        const dateTime = new Date(`${date}T00:00:00.000Z`).getTime()
        const count = asNumber(row.count)
        if (row.event_type === 'submitted') {
          const index = trendBucketIndex(range, date, window.start, bucketCount, duration)
          if (dateTime >= window.start.getTime() && dateTime < window.end.getTime()) {
            currentSubmitted[index] = (currentSubmitted[index] ?? 0) + count
          }
        } else {
          const index = trendBucketIndex(range, date, window.start, bucketCount, duration)
          if (dateTime >= window.start.getTime() && dateTime < window.end.getTime()) {
            currentProcessed[index] = (currentProcessed[index] ?? 0) + count
          }
        }
      }

      const compareBucketCount = currentCompare.length
      for (const row of compareEvents) {
        const date = dayKey(row.event_date)
        const target = row.period === 'current' ? currentCompare : previousCompare
        const rangeStart = row.period === 'current' ? window.start : window.previousStart
        const rangeDuration = row.period === 'current'
          ? window.end.getTime() - window.start.getTime()
          : window.previousEnd.getTime() - window.previousStart.getTime()
        const index = periodKey(date, rangeStart, rangeDuration, compareBucketCount)
        target[index] = (target[index] ?? 0) + asNumber(row.count)
      }

      const trend: TrendPoint[] = currentSubmitted.map((submitted, index) => ({
        label: bucketLabel(range, index, window.start),
        submitted,
        processed: currentProcessed[index] ?? 0,
      }))
      const compare = currentCompare.map((current, index) => ({
        label: range === 'year' ? `${index + 1}月` : range === 'd7' ? trend[index]?.label ?? '' : `第${index + 1}段`,
        current,
        previous: previousCompare[index] ?? 0,
      }))

      const insights: AnalyticsInsight[] = []
      const pendingAll = asNumber(pendingRows[0]?.count)
      const overdueTasks = asNumber(overdueRows[0]?.count)
      if (pendingAll > 0) insights.push({ id: 'pending', tone: 'info', key: 'pendingApprovals', value: pendingAll })
      if (overdueTasks > 0) insights.push({ id: 'overdue', tone: 'warning', key: 'overdueTasks', value: overdueTasks })
      if ((currentAttendance.get('late') ?? 0) > 0) {
        insights.push({ id: 'late', tone: 'warning', key: 'lateAttendance', value: currentAttendance.get('late') ?? 0 })
      }
      if (insights.length === 0) insights.push({ id: 'clear', tone: 'positive', key: 'noIssues', value: 0 })

      return {
        range,
        kpis: [
          buildKpi('approvals', approvalCount, previousApprovalCount, 'number'),
          buildKpi('pendingApprovals', pendingCount, previousPendingCount, 'number'),
          buildKpi('taskCompletion', currentTaskCount === 0 ? null : currentTaskCompletion, previousTaskCount === 0 ? null : previousTaskCompletion, 'percent', true),
          buildKpi('attendance', currentAttendanceCount === 0 ? null : currentAttendanceRate, previousAttendanceCount === 0 ? null : previousAttendanceRate, 'percent', true),
        ],
        trend,
        compare: compare.map((bucket) => ({ ...bucket, label: bucket.label || '—' })),
        departments: departmentRows.map((row) => ({ name: row.name, value: asNumber(row.count) })),
        approvalBreakdown: ['expense', 'leave', 'purchase', 'contract'].map((key) => ({
          key: key as 'expense' | 'leave' | 'purchase' | 'contract',
          value: asNumber(typeRows.find((row) => row.approval_type === key)?.count),
        })),
        insights,
        metrics: [
          buildMetric('approvalCount', approvalCount, previousApprovalCount),
          buildMetric('approvedCount', currentApprovals.get('approved') ?? 0, previousApprovals.get('approved') ?? 0),
          buildMetric('rejectedCount', currentApprovals.get('rejected') ?? 0, previousApprovals.get('rejected') ?? 0),
          buildMetric('pendingCount', pendingCount, previousPendingCount),
        ],
      }
    },
  }
}
