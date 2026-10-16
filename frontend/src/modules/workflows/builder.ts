/**
 * 对话式审批构建器（演示逻辑：关键词识别 + 逐字段追问）。
 *
 * 真实环境中由 AI 能力层生成结构化输出（经严格 Schema 校验后回填表单），
 * 本文件在接入后端 AI 能力后被替换删除；追问话术为演示文案。
 */
import type { ApprovalType } from './types'

export interface BuilderFieldDef {
  key: string
  label: string
  question: string
  /** 将用户回答转换为展示值（如金额加千分位） */
  parse?: (raw: string) => string
}

export const TYPE_LABEL: Record<ApprovalType, string> = {
  expense: '报销',
  leave: '请假',
  purchase: '采购',
  contract: '合同',
}

const TYPE_KEYWORDS: [ApprovalType, RegExp][] = [
  ['expense', /报销|发票|车票|高铁|机票|打车|餐费|住宿|招待|差旅/],
  ['leave', /请假|年假|事假|病假|调休|休假/],
  ['purchase', /采购|购买|买|设备|服务器|耗材|订阅/],
  ['contract', /合同|签约|协议|续费/],
]

export function detectType(text: string): ApprovalType | null {
  for (const [type, pattern] of TYPE_KEYWORDS) {
    if (pattern.test(text)) return type
  }
  return null
}

/** 从自然语言中提取金额（分）；支持「万」 */
export function amountCentFromText(text: string): number | undefined {
  const match = /(\d+(?:\.\d+)?)\s*(万)?/.exec(text)
  if (!match?.[1]) return undefined
  let value = Number(match[1])
  if (Number.isNaN(value)) return undefined
  if (match[2]) value *= 10_000
  return Math.round(value * 100)
}

function parseAmountDisplay(raw: string): string {
  const cents = amountCentFromText(raw)
  if (cents === undefined) return raw
  return `¥${(cents / 100).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

const REASON_FIELD: BuilderFieldDef = {
  key: 'reason',
  label: '事由',
  question: '最后补充一下事由说明，我会作为单据说明。',
}

export const FIELDS_BY_TYPE: Record<ApprovalType, BuilderFieldDef[]> = {
  expense: [
    { key: 'category', label: '费用类型', question: '这笔费用的类型是什么？（差旅 / 交通 / 办公 / 招待）' },
    { key: 'amount', label: '金额', question: '报销金额是多少？（例如 320 元）', parse: parseAmountDisplay },
    { key: 'date', label: '费用日期', question: '费用发生的日期是？（例如 10 月 12 日）' },
    REASON_FIELD,
  ],
  leave: [
    { key: 'leaveType', label: '请假类型', question: '请假类型是？（年假 / 事假 / 病假 / 调休）' },
    { key: 'startDate', label: '开始日期', question: '从哪天开始？（例如 10 月 20 日）' },
    { key: 'days', label: '天数', question: '一共请几天？', parse: (raw) => (/天/.test(raw) ? raw : `${raw} 天`) },
    REASON_FIELD,
  ],
  purchase: [
    { key: 'item', label: '采购物品', question: '要采购的物品与数量是？' },
    { key: 'amount', label: '金额', question: '预估金额是多少？', parse: parseAmountDisplay },
    { key: 'supplier', label: '供应商', question: '意向供应商是哪家？（可填「待定」）' },
    REASON_FIELD,
  ],
  contract: [
    { key: 'partner', label: '对方主体', question: '合同对方主体是谁？' },
    { key: 'amount', label: '合同金额', question: '合同金额是多少？', parse: parseAmountDisplay },
    { key: 'term', label: '合同期限', question: '合同期限如何约定？' },
    REASON_FIELD,
  ],
}

/** 从草稿生成单据标题：优先取事由，其次取第一个非金额字段 */
export function buildTitle(type: ApprovalType, draft: Record<string, string>): string {
  const reason = draft.reason?.trim()
  if (reason) return reason.length > 24 ? `${reason.slice(0, 24)}…` : reason
  for (const def of FIELDS_BY_TYPE[type]) {
    if (def.key === 'amount') continue
    const value = draft[def.key]?.trim()
    if (value) return `${TYPE_LABEL[type]}：${value}`
  }
  return TYPE_LABEL[type]
}
