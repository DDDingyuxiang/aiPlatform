/** workflows 模块公开导出：跨模块仅可经由本文件引用 */
export { useWorkflowsStore } from './store'
export { default as WorkflowCenterView } from './WorkflowCenterView.vue'
export { default as ApprovalSection } from './components/ApprovalSection.vue'
export { default as ApprovalDetailDrawer } from './components/ApprovalDetailDrawer.vue'
export { default as CreateApprovalModal } from './components/CreateApprovalModal.vue'
export type {
  ApprovalAiSummary,
  ApprovalApplicant,
  ApprovalAttachment,
  ApprovalField,
  ApprovalItem,
  ApprovalPerson,
  ApprovalStatus,
  ApprovalStep,
  ApprovalStepStatus,
  ApprovalType,
  CreateApprovalPayload,
  DecisionPayload,
} from './types'
