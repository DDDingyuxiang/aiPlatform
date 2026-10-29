/** 经营分析接口（经统一 HTTP 客户端，开发环境由 mock.ts 拦截） */
import { http } from '@/core/http'
import type { AnalyticsOverview, AnalyticsRange } from '@aiplatform/contracts'

export const analyticsApi = {
  overview: (range: AnalyticsRange) =>
    http.get<AnalyticsOverview>('/analytics/overview', { params: { range } }),
}
