/**
 * 审批流程契约（workflows 模块）。
 *
 * - 对外 ID 统一为字符串：审批单与附件使用对应表的 public_id，人员使用 employees.public_id；
 * - 审批单引用提交时生效的流程定义版本，历史单据的表单与节点不随模板变更；
 * - 节点状态包含 skipped：或签未执行、会签被驳回后的其余审批人；
 * - AI 摘要仅供参考，不参与审批状态判定；
 * - 流程定义的读取/维护契约待管理端接口确定后补充。
 */
import { z } from 'zod'
import { apiIdSchema, isoDateTimeSchema } from './common.js'

/** 审批类型（报销是 expense 的一种类型） */
export const approvalTypeSchema = z.enum(['expense', 'leave', 'purchase', 'contract'])
export type ApprovalType = z.infer<typeof approvalTypeSchema>

/** 审批单状态 */
export const approvalStatusSchema = z.enum(['pending', 'approved', 'rejected'])
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>

/** 节点状态：skipped 表示未执行（或签他人已通过 / 会签已被驳回） */
export const approvalStepStatusSchema = z.enum(['waiting', 'active', 'done', 'rejected', 'skipped'])
export type ApprovalStepStatus = z.infer<typeof approvalStepStatusSchema>

/** 节点已执行的动作 */
export const approvalActionSchema = z.enum(['submit', 'approve', 'reject'])
export type ApprovalAction = z.infer<typeof approvalActionSchema>

/** 审批人简要信息 */
export const approvalPersonSchema = z.object({
  id: apiIdSchema,
  name: z.string().min(1).max(128),
})
export type ApprovalPerson = z.infer<typeof approvalPersonSchema>

/** 申请人（含提交时部门名称） */
export const approvalApplicantSchema = approvalPersonSchema.extend({
  department: z.string().max(255),
})
export type ApprovalApplicant = z.infer<typeof approvalApplicantSchema>

/** 审批单结构化表单字段（与 approval_fields 对应） */
export const approvalFieldSchema = z.object({
  key: z.string().min(1).max(128),
  label: z.string().min(1).max(128),
  value: z.string(),
})
export type ApprovalField = z.infer<typeof approvalFieldSchema>

/** 审批单附件（文件本体不经过契约传递） */
export const approvalAttachmentSchema = z.object({
  id: apiIdSchema,
  name: z.string().min(1).max(255),
  sizeBytes: z.number().int().nonnegative(),
})
export type ApprovalAttachment = z.infer<typeof approvalAttachmentSchema>

/** 审批流程时间线节点 */
export const approvalStepSchema = z.object({
  id: apiIdSchema,
  nodeName: z.string().min(1).max(128),
  /** 提交节点为申请人；系统节点为空 */
  approver: approvalPersonSchema.nullable(),
  status: approvalStepStatusSchema,
  comment: z.string().max(2000).nullable().optional(),
  actedAt: isoDateTimeSchema.nullable().optional(),
})
export type ApprovalStep = z.infer<typeof approvalStepSchema>

/** AI 智能摘要（展示需标注来源） */
export const approvalAiSummarySchema = z.object({
  highlights: z.array(z.string().min(1)).default([]),
  risk: z.string().nullable().optional(),
})
export type ApprovalAiSummary = z.infer<typeof approvalAiSummarySchema>

/** 审批单详情/列表项 */
export const approvalItemSchema = z.object({
  id: apiIdSchema,
  type: approvalTypeSchema,
  title: z.string().min(1).max(255),
  applicant: approvalApplicantSchema,
  amountCent: z.number().int().nonnegative().nullable().optional(),
  submittedAt: isoDateTimeSchema,
  status: approvalStatusSchema,
  urgent: z.boolean().optional(),
  fields: z.array(approvalFieldSchema),
  attachments: z.array(approvalAttachmentSchema),
  steps: z.array(approvalStepSchema),
  /** 当前待办节点的审批人；status=pending 时有值 */
  currentApproverId: apiIdSchema.nullable().optional(),
  aiSummary: approvalAiSummarySchema,
})
export type ApprovalItem = z.infer<typeof approvalItemSchema>

/** 审批列表响应（当前接口返回与当前用户相关的单据） */
export const approvalListResultSchema = z.array(approvalItemSchema)
export type ApprovalListResult = z.infer<typeof approvalListResultSchema>

/** 发起审批请求：流程定义由后端按 type 选择当前启用版本 */
export const createApprovalPayloadSchema = z.strictObject({
  type: approvalTypeSchema,
  title: z.string().trim().min(1).max(255),
  fields: z.array(approvalFieldSchema).default([]),
  amountCent: z.number().int().nonnegative().optional(),
  urgent: z.boolean().optional(),
})
export type CreateApprovalPayload = z.infer<typeof createApprovalPayloadSchema>

/** 审批决策请求：驳回必须填写意见 */
export const decisionPayloadSchema = z
  .strictObject({
    action: z.enum(['approve', 'reject']),
    comment: z.string().trim().max(2000).default(''),
  })
  .superRefine((value, ctx) => {
    if (value.action === 'reject' && value.comment.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['comment'],
        message: '驳回时必须填写审批意见',
      })
    }
  })
export type DecisionPayload = z.infer<typeof decisionPayloadSchema>
