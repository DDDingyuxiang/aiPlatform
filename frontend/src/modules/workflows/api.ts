/** 审批接口（经统一 HTTP 客户端，开发环境由 mock.ts 拦截） */
import { http } from '@/core/http'
import type { ApprovalItem, CreateApprovalPayload, DecisionPayload } from './types'

export const workflowsApi = {
  list: () => http.get<ApprovalItem[]>('/workflows/approvals'),
  create: (payload: CreateApprovalPayload) =>
    http.post<ApprovalItem>('/workflows/approvals', payload),
  decide: (id: string, payload: DecisionPayload) =>
    http.post<ApprovalItem>(`/workflows/approvals/${id}/decision`, payload),
}
