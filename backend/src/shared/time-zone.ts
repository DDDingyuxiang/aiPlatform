/** 业务时区时间工具。 */

function timeZoneParts(date: Date, timeZone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)

  const result: Record<string, number> = {}
  for (const part of parts) {
    if (part.type !== 'literal') result[part.type] = Number(part.value)
  }
  return result
}

/**
 * 把业务时区中的某个日期 + 小时转换为 UTC Date。
 *
 * 例如 Asia/Shanghai 下的 2026-10-19 18:00 → 2026-10-19T10:00:00Z。
 * 先按 UTC 猜测，再根据该时刻的时区偏移校正；中国无夏令时，单次校正足够。
 */
export function zonedDateTimeToUtc(date: string, hour: number, timeZone: string): Date {
  const guess = new Date(
    `${date}T${String(hour).padStart(2, '0')}:00:00.000Z`,
  )
  const parts = timeZoneParts(guess, timeZone)
  const asUtc = Date.UTC(
    parts.year ?? 0,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  )
  return new Date(guess.getTime() - (asUtc - guess.getTime()))
}

/** 按业务时区格式化时间，用于系统消息等给用户看的文本 */
export function formatDateTimeInTimeZone(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}
