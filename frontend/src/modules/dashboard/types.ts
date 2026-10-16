import type { IconName } from '@/shared/components/icon-registry'

/** 工作台展示数据（演示阶段为本地样例，后续替换为聚合接口） */

export interface KpiStat {
  /** 对应 i18n 键 dashboard.kpi.{key} */
  key: 'pendingTasks' | 'pendingApprovals' | 'unreadNotices' | 'monthExpense'
  value: number
  /** value 的展示格式；currency 表示单位为分 */
  format?: 'number' | 'currency'
  icon: IconName
  tone: 'primary' | 'warning' | 'info' | 'success'
  delta?: { direction: 'up' | 'down'; text: string }
}

export type ApprovalType = 'expense' | 'leave' | 'purchase' | 'contract'

export interface ApprovalPreview {
  id: string
  type: ApprovalType
  title: string
  applicant: string
  department: string
  amountCent?: number
  submittedAt: string
  urgent?: boolean
}

export interface TaskPreview {
  id: string
  title: string
  priority: 'high' | 'medium' | 'low'
  dueAt: string
  done: boolean
}

export interface AnnouncementPreview {
  id: string
  title: string
  category: 'company' | 'policy' | 'event' | 'system'
  publishedAt: string
  unread: boolean
  pinned?: boolean
}

/** AI 洞察为模型输出内容（演示阶段为静态样例文案） */
export interface AiInsight {
  id: string
  tone: 'info' | 'warning' | 'positive'
  text: string
}

export interface WeeklyProgress {
  done: number
  total: number
}
