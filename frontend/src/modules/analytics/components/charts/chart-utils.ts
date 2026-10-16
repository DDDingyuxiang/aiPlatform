/**
 * 图表几何工具（手写 SVG 的公共部分）。
 * 视觉规范（dataviz）：2px 折线、柱端 4px 圆角（基线端为方角）、
 * 1px 实线网格（禁止虚线）、填充色仅作 10% 淡洗、坐标系文字使用文本令牌。
 */

export interface ChartPoint {
  x: number
  y: number
}

/** 取「好看」的坐标轴上限（1 / 2 / 2.5 / 5 / 10 × 10^n） */
export function niceCeil(value: number): number {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalized = value / magnitude
  const step =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10
  return step * magnitude
}

export function axisTicks(max: number, count = 4): number[] {
  return Array.from({ length: count + 1 }, (_, index) => (max / count) * index)
}

export function formatTickValue(value: number, locale: string): string {
  if (Math.abs(value) >= 1000) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)
  }
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(1)
}

export function linePath(points: ChartPoint[]): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ')
}

export function areaPath(points: ChartPoint[], baselineY: number): string {
  const [first] = points
  const last = points[points.length - 1]
  if (!first || !last) return ''
  return `${linePath(points)} L${last.x.toFixed(1)} ${baselineY.toFixed(1)} L${first.x.toFixed(1)} ${baselineY.toFixed(1)} Z`
}

/** 顶部圆角、基线端方角的柱形路径（数据端 4px 圆角） */
export function roundedTopRect(
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 4,
): string {
  if (height <= 0 || width <= 0) return ''
  const r = Math.min(radius, width / 2, height)
  const bottom = y + height
  const right = x + width
  return [
    `M${x} ${bottom}`,
    `L${x} ${y + r}`,
    `Q${x} ${y} ${x + r} ${y}`,
    `L${right - r} ${y}`,
    `Q${right} ${y} ${right} ${y + r}`,
    `L${right} ${bottom}`,
    'Z',
  ].join(' ')
}

/** 环形扇区路径（angles 为弧度，0 指向 3 点钟方向） */
export function donutArc(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number,
): string {
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0
  const ox1 = cx + outerRadius * Math.cos(startAngle)
  const oy1 = cy + outerRadius * Math.sin(startAngle)
  const ox2 = cx + outerRadius * Math.cos(endAngle)
  const oy2 = cy + outerRadius * Math.sin(endAngle)
  const ix1 = cx + innerRadius * Math.cos(endAngle)
  const iy1 = cy + innerRadius * Math.sin(endAngle)
  const ix2 = cx + innerRadius * Math.cos(startAngle)
  const iy2 = cy + innerRadius * Math.sin(startAngle)
  return [
    `M${ox1.toFixed(2)} ${oy1.toFixed(2)}`,
    `A${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${ox2.toFixed(2)} ${oy2.toFixed(2)}`,
    `L${ix1.toFixed(2)} ${iy1.toFixed(2)}`,
    `A${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix2.toFixed(2)} ${iy2.toFixed(2)}`,
    'Z',
  ].join(' ')
}
