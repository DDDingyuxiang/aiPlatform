import type { AnalyticsOverview, AnalyticsRange } from '@aiplatform/contracts'
import type { AuthContext } from '../identity/index.js'

export interface AnalyticsRepository {
  overview(tenantId: string, range: AnalyticsRange): Promise<AnalyticsOverview>
}

export interface AnalyticsService {
  overview(auth: AuthContext, range: AnalyticsRange): Promise<AnalyticsOverview>
}
