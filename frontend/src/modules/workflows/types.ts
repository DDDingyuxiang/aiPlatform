/** 审批类型（与后端 workflows 模块的契约保持一致；报销是审批的一种类型） */

export type ApprovalType = 'expense' | 'leave' | 'purchase' | 'contract'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'
export type ApprovalStepStatus = 'done' | 'active' | 'waiting' | 'rejected'

export interface ApprovalPerson {
  id: string
  name: string
}

export interface ApprovalApplicant extends ApprovalPerson {
  department: string
}

/** 申请信息键值对（展示与落库均以结构化字段为准） */
export interface ApprovalField {
  key: string
  label: string
  value: string
}

export interface ApprovalAttachment {
  id: string
  name: string
  sizeBytes: number
}

export interface ApprovalStep {
  id: string
  nodeName: string
  /** 提交节点为申请人；系统节点可为空 */
  approver: ApprovalPerson | null
  status: ApprovalStepStatus
  comment?: string
  /** ISO 8601 */
  actedAt?: string
}

/** AI 智能摘要（真实环境由 AI 能力层生成，展示需标注来源） */
export interface ApprovalAiSummary {
  highlights: string[]
  risk?: string
}

export interface ApprovalItem {
  id: string
  type: ApprovalType
  title: string
  applicant: ApprovalApplicant
  amountCent?: number
  /** ISO 8601 */
  submittedAt: string
  status: ApprovalStatus
  urgent?: boolean
  fields: ApprovalField[]
  attachments: ApprovalAttachment[]
  steps: ApprovalStep[]
  /** 当前待办节点的审批人（status=pending 时有值） */
  currentApproverId?: string
  aiSummary: ApprovalAiSummary
}

/** 对话式构建产出的创建载荷 */
export interface CreateApprovalPayload {
  type: ApprovalType
  title: string
  fields: ApprovalField[]
  amountCent?: number
}

export interface DecisionPayload {
  action: 'approve' | 'reject'
  comment: string
}
