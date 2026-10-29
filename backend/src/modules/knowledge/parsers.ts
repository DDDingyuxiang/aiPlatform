import { extname } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import type { KnowledgeDocFileType } from '@aiplatform/contracts'
import JSZip from 'jszip'
import mammoth from 'mammoth'
import { extractText } from 'unpdf'

/** 单次上传允许提取的最大字符数，避免超大文档拖垮索引 */
const MAX_EXTRACTED_CHARS = 300_000
const MAX_ARCHIVE_ENTRIES = 1_000
const MAX_ARCHIVE_ENTRY_BYTES = 16 * 1024 * 1024
const MAX_ARCHIVE_TOTAL_BYTES = 32 * 1024 * 1024

interface ZipObjectSizeMetadata {
  compressedSize: number
  uncompressedSize: number
  compression: { magic: string }
  compressedContent: Uint8Array
}

interface ZipObjectWithInternalData extends JSZip.JSZipObject {
  _data?: ZipObjectSizeMetadata
}

async function loadSafeOfficeArchive(buffer: Buffer): Promise<JSZip> {
  const zip = await JSZip.loadAsync(buffer)
  const entries = Object.values(zip.files).filter((entry) => !entry.dir)
  if (entries.length > MAX_ARCHIVE_ENTRIES) {
    throw new DocumentParseError('压缩文档包含过多文件')
  }

  let totalUncompressedBytes = 0
  for (const entry of entries) {
    const size = (entry as ZipObjectWithInternalData)._data
    if (
      !size ||
      !Number.isSafeInteger(size.uncompressedSize) ||
      size.uncompressedSize < 0 ||
      !Number.isSafeInteger(size.compressedSize) ||
      size.compressedSize < 0 ||
      !size.compression ||
      !size.compressedContent
    ) {
      throw new DocumentParseError('压缩文档目录无效')
    }
    if (size.compressedContent.byteLength !== size.compressedSize) {
      throw new DocumentParseError('压缩文档目录无效')
    }
    if (size.uncompressedSize > MAX_ARCHIVE_ENTRY_BYTES) {
      throw new DocumentParseError('压缩文档中的单个文件过大')
    }
    if (totalUncompressedBytes + size.uncompressedSize > MAX_ARCHIVE_TOTAL_BYTES) {
      throw new DocumentParseError('压缩文档解压后过大')
    }

    const outputLimit = Math.min(
      MAX_ARCHIVE_ENTRY_BYTES,
      MAX_ARCHIVE_TOTAL_BYTES - totalUncompressedBytes,
    )
    let actualUncompressedSize: number
    try {
      if (size.compression.magic === '\u0000\u0000') {
        actualUncompressedSize = size.compressedContent.byteLength
      } else if (size.compression.magic === '\u0008\u0000') {
        actualUncompressedSize = inflateRawSync(size.compressedContent, {
          maxOutputLength: Math.max(1, outputLimit),
        }).byteLength
      } else {
        throw new DocumentParseError('压缩文档使用了不支持的压缩算法')
      }
    } catch (error) {
      if (error instanceof DocumentParseError) throw error
      throw new DocumentParseError('压缩文档解压失败或超过资源上限')
    }
    if (actualUncompressedSize !== size.uncompressedSize || actualUncompressedSize > outputLimit) {
      throw new DocumentParseError('压缩文档解压后大小与目录不符')
    }
    totalUncompressedBytes += actualUncompressedSize
  }
  return zip
}

export class DocumentParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocumentParseError'
  }
}

export interface ParsedDocument {
  fileType: KnowledgeDocFileType
  mimeType: string
  text: string
}

export function resolveFileType(fileName: string): KnowledgeDocFileType | null {
  switch (extname(fileName).toLowerCase()) {
    case '.pdf':
      return 'pdf'
    case '.docx':
      return 'doc'
    case '.xlsx':
    case '.xls':
      return 'xls'
    case '.pptx':
      return 'ppt'
    case '.txt':
    case '.md':
    case '.markdown':
      return 'txt'
    default:
      return null
  }
}

function normalizeText(value: string): string {
  return value
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const result = await extractText(new Uint8Array(buffer), { mergePages: true })
  return result.text
}

async function extractDocx(buffer: Buffer): Promise<string> {
  await loadSafeOfficeArchive(buffer)
  const result = await mammoth.extractRawText({ buffer })
  return result.value
}

function extractXmlTexts(xml: string): string {
  return [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
    .map((match) => decodeXml(match[1] ?? ''))
    .join('')
}

/**
 * XLSX 本质是 ZIP + XML。这里只提取单元格文本，不引入额外的表格解析依赖；
 * 共享字符串、内联字符串与公式缓存值均可读取，日期会以序列值展示。
 */
async function extractSpreadsheet(buffer: Buffer): Promise<string> {
  const zip = await loadSafeOfficeArchive(buffer)
  const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('string')
  const sharedStrings = sharedXml
    ? [...sharedXml.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)].map((match) =>
        extractXmlTexts(match[1] ?? ''),
      )
    : []

  const sheets = Object.keys(zip.files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort((a, b) => {
      const left = Number(a.match(/sheet(\d+)\.xml$/)?.[1] ?? 0)
      const right = Number(b.match(/sheet(\d+)\.xml$/)?.[1] ?? 0)
      return left - right
    })

  const parts: string[] = []
  for (const name of sheets) {
    const xml = await zip.file(name)?.async('string')
    if (!xml) continue
    const lines: string[] = []
    for (const row of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const values: string[] = []
      for (const cell of (row[1] ?? '').matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attributes = cell[1] ?? ''
        const inner = cell[2] ?? ''
        const type = /t="([^"]+)"/.exec(attributes)?.[1]
        if (type === 's') {
          const index = Number(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? -1)
          values.push(sharedStrings[index] ?? '')
        } else if (type === 'inlineStr') {
          values.push(extractXmlTexts(inner))
        } else {
          const value = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1]
          values.push(value ? decodeXml(value) : extractXmlTexts(inner))
        }
      }
      const line = values.filter(Boolean).join(' | ')
      if (line) lines.push(line)
    }
    if (lines.length > 0) {
      const sheetName = name.split('/').pop()?.replace('.xml', '') ?? 'sheet'
      parts.push(`【${sheetName}】\n${lines.join('\n')}`)
    }
  }
  return parts.join('\n\n')
}

async function extractPptx(buffer: Buffer): Promise<string> {
  const zip = await loadSafeOfficeArchive(buffer)
  const slides = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const left = Number(a.match(/slide(\d+)\.xml$/)?.[1] ?? 0)
      const right = Number(b.match(/slide(\d+)\.xml$/)?.[1] ?? 0)
      return left - right
    })

  const parts: string[] = []
  for (const name of slides) {
    const xml = await zip.file(name)?.async('string')
    if (!xml) continue
    const texts = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map((match) =>
      decodeXml(match[1] ?? ''),
    )
    if (texts.length > 0) parts.push(texts.join(' '))
  }
  return parts.join('\n')
}

/**
 * 从上传文件中提取纯文本。
 *
 * 当前支持 PDF、DOCX、XLS/XLSX、PPTX 与 TXT/MD；扫描版 PDF 与图片需要 OCR，
 * 暂不支持时返回明确错误，而不是静默建立空索引。
 */
export async function parseDocument(
  buffer: Buffer,
  fileName: string,
): Promise<ParsedDocument> {
  const fileType = resolveFileType(fileName)
  if (!fileType) {
    throw new DocumentParseError('暂不支持该文件类型')
  }

  const extension = extname(fileName).toLowerCase()
  let rawText: string
  let mimeType: string

  try {
    switch (extension) {
      case '.pdf':
        mimeType = 'application/pdf'
        rawText = await extractPdf(buffer)
        break
      case '.docx':
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        rawText = await extractDocx(buffer)
        break
      case '.xlsx':
        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        rawText = await extractSpreadsheet(buffer)
        break
      case '.xls':
        throw new DocumentParseError('旧版 .xls 暂不支持，请另存为 .xlsx 后上传')
      case '.pptx':
        mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        rawText = await extractPptx(buffer)
        break
      case '.txt':
      case '.md':
      case '.markdown':
        mimeType = extension === '.md' || extension === '.markdown' ? 'text/markdown' : 'text/plain'
        rawText = buffer.toString('utf8')
        break
      default:
        throw new DocumentParseError('暂不支持该文件类型')
    }
  } catch (error) {
    if (error instanceof DocumentParseError) throw error
    throw new DocumentParseError(
      `文档解析失败：${error instanceof Error ? error.message : '未知错误'}`,
    )
  }

  const text = normalizeText(rawText)
  if (text.length < 10) {
    throw new DocumentParseError(
      '未提取到可用文本，可能是扫描件或空文档；请上传包含文字的 PDF/Word/文本文件',
    )
  }
  if (text.length > MAX_EXTRACTED_CHARS) {
    throw new DocumentParseError('文档内容过大，请拆分后再上传')
  }

  return { fileType, mimeType, text }
}
