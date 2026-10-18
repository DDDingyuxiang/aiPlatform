import { describe, expect, it } from 'vitest'
import { chunkDocumentText } from '../chunking.js'

describe('document chunking', () => {
  it('按长度切分并保留相邻分块重叠', () => {
    const sentence = '员工出差住宿费按城市分级，一线城市每晚上限六百元。'
    const text = Array.from({ length: 30 }, (_, index) => `${index}${sentence}`).join('\n')

    const chunks = chunkDocumentText(text, 180, 40)

    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(180)
    }
    // 第二个分块开头应保留前一分块尾部内容
    expect(chunks[1]?.startsWith(chunks[0]?.slice(-40) ?? '')).toBe(true)
  })

  it('空文档返回空数组，超长句子硬切', () => {
    expect(chunkDocumentText('   ', 180, 40)).toEqual([])

    const longSentence = `${'很长的句子'.repeat(100)}。`
    const chunks = chunkDocumentText(longSentence, 120, 20)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((chunk) => chunk.length <= 120)).toBe(true)
  })
})
