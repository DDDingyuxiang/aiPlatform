import type {
  ApprovalItem,
  CreateApprovalPayload,
  DecisionPayload,
} from '@aiplatform/contracts'
import { AppError, ErrorCode } from '../../http/errors.js'
import type { AuthContext } from '../identity/index.js'
import type { WorkflowRepository, WorkflowService } from './types.js'

export function createWorkflowService(repository: WorkflowRepository): WorkflowService {
  function translateError(error: unknown): never {
    if (error instanceof Error) {
      if (error.name === 'WorkflowConfigurationError') {
        throw new AppError(ErrorCode.CONFLICT, error.message, 409)
      }
      if (error.name === 'ApprovalNotFoundError') {
        throw new AppError(ErrorCode.NOT_FOUND, error.message, 404)
      }
      if (error.name === 'ApprovalConflictError') {
        throw new AppError(ErrorCode.CONFLICT, error.message, 409)
      }
    }
    throw error
  }

  return {
    async list(auth: AuthContext): Promise<ApprovalItem[]> {
      return repository.listRelated(auth.tenantId, auth.employeeId)
    },

    async create(
      auth: AuthContext,
      payload: CreateApprovalPayload,
    ): Promise<ApprovalItem> {
      try {
        return await repository.create(auth, payload)
      } catch (error) {
        translateError(error)
      }
    },

    async decide(
      auth: AuthContext,
      publicId: string,
      payload: DecisionPayload,
    ): Promise<ApprovalItem> {
      try {
        return await repository.decide(auth, publicId, payload)
      } catch (error) {
        translateError(error)
      }
    },
  }
}
