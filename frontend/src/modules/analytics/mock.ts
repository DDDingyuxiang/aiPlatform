/**
 * 显式 Mock 模式下的经营分析演示数据；真实模式由后端 analytics 模块提供数据。
 */
import { defineMock, fail } from '@/core/http'
import { findMockUserId } from '@/core/auth/mock'
import { buildOverview } from './data'
import type { AnalyticsRange } from './types'

const VALID_RANGES: AnalyticsRange[] = ['d7', 'd30', 'quarter', 'year']

defineMock(
  'GET',
  '/analytics/overview',
  ({ query, token }) => {
    if (!findMockUserId(token)) return fail(40100, '登录状态已失效', 401)
    const range = (query.range ?? 'd30') as AnalyticsRange
    if (!VALID_RANGES.includes(range)) return fail(40040, '不支持的时间范围', 400)
    return buildOverview(range)
  },
  { delayMs: 350 },
)
