/** 按指定时区计算“当前月份”的起止边界（UTC 日期字符串） */
export interface MonthRange {
  /** YYYY-MM */
  month: string
  /** YYYY-MM-01 */
  startDate: string
  /** 下月 1 日 YYYY-MM-01，查询时使用左闭右开区间 */
  nextMonthStartDate: string
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  const value = parts.find((item) => item.type === type)?.value
  if (!value) throw new Error(`无法解析时区时间字段：${type}`)
  return value
}

export function resolveMonthRange(timeZone: string, now = new Date()): MonthRange {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now)

  const year = Number(part(parts, 'year'))
  const month = Number(part(parts, 'month'))
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('无法解析当前月份')
  }

  const currentMonth = String(month).padStart(2, '0')
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  const nextMonthText = String(nextMonth).padStart(2, '0')

  return {
    month: `${year}-${currentMonth}`,
    startDate: `${year}-${currentMonth}-01`,
    nextMonthStartDate: `${nextYear}-${nextMonthText}-01`,
  }
}

/** 指定时区下的今天（YYYY-MM-DD），用于种子数据等场景 */
export function resolveDateInTimeZone(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  return `${part(parts, 'year')}-${part(parts, 'month')}-${part(parts, 'day')}`
}
