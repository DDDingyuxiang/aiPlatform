/**
 * 经营分析状态（Pinia）。
 * 切换时间范围时保留上一次渲染（loading 期间视图降透明度，不做骨架闪烁）。
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'
import { analyticsApi } from './api'
import type { AnalyticsOverview, AnalyticsRange } from './types'

export const useAnalyticsStore = defineStore('analytics', () => {
  const overview = ref<AnalyticsOverview | null>(null)
  const range = ref<AnalyticsRange>('d30')
  const loading = ref(false)

  async function load(nextRange: AnalyticsRange = range.value): Promise<void> {
    if (loading.value) return
    range.value = nextRange
    loading.value = true
    try {
      overview.value = await analyticsApi.overview(nextRange)
    } catch (error) {
      console.error('[analytics] 经营数据加载失败', error)
    } finally {
      loading.value = false
    }
  }

  return { overview, range, loading, load }
})
