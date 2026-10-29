import type {
  ApprovalItem,
  CreateApprovalPayload,
  DecisionPayload,
} from '@aiplatform/contracts'
import type { AuthContext } from '../identity/index.js'

export interface WorkflowRepository {
  listRelated(tenantId: string, employeeId: string): Promise<ApprovalItem[]>
  create(auth: AuthContext, payload: CreateApprovalPayload): Promise<ApprovalItem>
  decide(
    auth: AuthContext,
    publicId: string,
    payload: DecisionPayload,
  ): Promise<ApprovalItem>
}

export interface WorkflowService {
  list(auth: AuthContext): Promise<ApprovalItem[]>
  create(auth: AuthContext, payload: CreateApprovalPayload): Promise<ApprovalItem>
  decide(
    auth: AuthContext,
    publicId: string,
    payload: DecisionPayload,
  ): Promise<ApprovalItem>
}

export interface WorkflowNodeRecord {
  id: string
  nodeKey: string
  nodeName: string
  sequenceNo: number
  approverType: 'employee' | 'role' | 'department_manager'
  approverRefId: string | null
  approvalMode: 'any' | 'all'
}
