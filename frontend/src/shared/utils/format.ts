/**
 * 展示层格式化工具（日期、金额、数字、文件大小）。
 * 金额统一使用「分」作为数据层单位（与后端约定一致），展示时转换。
 */

export function formatCurrency(cents: number, locale: string, currency = 'CNY'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

export function formatNumber(value: number, locale: string, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, options).format(value)
}

export function formatDate(
  input: string | Date,
  locale: string,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' },
): string {
  const date = typeof input === 'string' ? new Date(input) : input
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(locale, options).format(date)
}

export function formatDateTime(input: string | Date, locale: string): string {
  return formatDate(input, locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * 相对时间（如「3 分钟前」）。
 * 45 秒以内返回 justNowLabel（由调用方从 i18n 传入），更早的按粒度递进，超过 7 天回退为日期。
 */
export function formatRelativeTime(
  input: string | Date,
  locale: string,
  justNowLabel: string,
): string {
  const date = typeof input === 'string' ? new Date(input) : input
  if (Number.isNaN(date.getTime())) return '—'
  const diffSeconds = (Date.now() - date.getTime()) / 1000
  if (diffSeconds < 45) return justNowLabel
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (diffSeconds < 3600) return formatter.format(-Math.round(diffSeconds / 60), 'minute')
  if (diffSeconds < 86400) return formatter.format(-Math.round(diffSeconds / 3600), 'hour')
  if (diffSeconds < 86400 * 7) return formatter.format(-Math.round(diffSeconds / 86400), 'day')
  return formatDate(date, locale)
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** 头像缩写：中文取姓氏首字，西文取前两个单词首字母 */
export function initials(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  if (/[一-鿿぀-ヿ]/.test(trimmed)) return trimmed.slice(0, 1)
  const words = trimmed.split(/\s+/)
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase()
}
