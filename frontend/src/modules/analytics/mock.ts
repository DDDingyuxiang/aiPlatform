/**
 * 经营分析接口的 Mock 实现（演示数据，后端 analytics 模块就绪后整体删除）。
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
