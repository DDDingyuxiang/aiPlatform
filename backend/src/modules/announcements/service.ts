import { AppError, ErrorCode } from '../../http/errors.js'
import type { CreateAnnouncementPayload } from '@aiplatform/contracts'
import type { AuthContext } from '../identity/index.js'
import type { AnnouncementsRepository, AnnouncementsService } from './types.js'

export function createAnnouncementsService(
  repository: AnnouncementsRepository,
): AnnouncementsService {
  return {
    list: (auth: AuthContext) => repository.list(auth),
    async markRead(auth, publicId) {
      if (!(await repository.markRead(auth, publicId))) {
        throw new AppError(ErrorCode.NOT_FOUND, '公告不存在', 404)
      }
    },
    markAllRead: (auth: AuthContext) => repository.markAllRead(auth),
    async create(auth: AuthContext, payload: CreateAnnouncementPayload) {
      if (!(await repository.create(auth, payload))) {
        throw new AppError(ErrorCode.NOT_FOUND, '指定部门不存在', 404)
      }
    },
  }
}
