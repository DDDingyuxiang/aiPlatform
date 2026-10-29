import type { AnalyticsRange } from '@aiplatform/contracts'
import type { AuthContext } from '../identity/index.js'
import type { AnalyticsRepository, AnalyticsService } from './types.js'

export function createAnalyticsService(repository: AnalyticsRepository): AnalyticsService {
  return {
    overview(auth: AuthContext, range: AnalyticsRange) {
      return repository.overview(auth.tenantId, range)
    },
  }
}
