/**
 * 文档分块。
 *
 * 以中文字符数为主要控制维度：优先在段落/句子边界切分，超长句子硬切；
 * 相邻分块保留少量重叠，避免检索时丢失跨块语义。
 */
const SENTENCE_BOUNDARY = /(?<=[。！？!?；;])/

function splitLongUnit(unit: string, size: number): string[] {
  if (unit.length <= size) return [unit]
  const parts: string[] = []
  for (let start = 0; start < unit.length; start += size) {
    parts.push(unit.slice(start, start + size))
  }
  return parts
}

function buildUnits(text: string, size: number): string[] {
  const units: string[] = []
  for (const paragraph of text.split('\n')) {
    const trimmed = paragraph.trim()
    if (!trimmed) continue
    if (trimmed.length <= size) {
      units.push(trimmed)
      continue
    }
    for (const sentence of trimmed.split(SENTENCE_BOUNDARY)) {
      const value = sentence.trim()
      if (value) units.push(...splitLongUnit(value, size))
    }
  }
  return units
}

export function chunkDocumentText(
  text: string,
  size = 350,
  overlap = 60,
): string[] {
  const normalized = text.trim()
  if (!normalized) return []
  if (size <= 0) throw new Error('分块大小必须大于 0')
  if (overlap < 0 || overlap >= size) throw new Error('分块重叠必须小于分块大小')

  const units = buildUnits(normalized, size)
  const chunks: string[] = []
  let current = ''

  const flush = (): void => {
    const value = current.trim()
    if (value) chunks.push(value)
    if (overlap > 0 && value) {
      current = value.slice(-overlap)
    } else {
      current = ''
    }
  }

  for (const unit of units) {
    if (current && current.length + 1 + unit.length > size) {
      flush()
      // 重叠片段 + 当前句子仍可能超长：只保留能放下的尾部重叠
      const available = size - unit.length - 1
      if (current && available > 0) current = current.slice(-available)
      else if (current) current = ''
    }
    current = current ? `${current}\n${unit}` : unit
  }
  const last = current.trim()
  if (last && last !== chunks.at(-1)) chunks.push(last)

  return chunks.filter((chunk) => chunk.length > 0)
}
