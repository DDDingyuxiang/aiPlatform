/**
 * 响应式断点感知（JS 侧）。
 * 断点值来自 core/theme/breakpoints.ts（权威定义），样式侧使用对应像素的媒体查询。
 */
import { readonly, ref } from 'vue'
import { BREAKPOINTS } from '@/core/theme/breakpoints'

function createQuery(query: string) {
  const media = window.matchMedia(query)
  const value = ref(media.matches)
  media.addEventListener('change', (event) => {
    value.value = event.matches
  })
  return value
}

const isMobile = createQuery(`(max-width: ${BREAKPOINTS.md - 1}px)`)
const isTablet = createQuery(`(min-width: ${BREAKPOINTS.md}px) and (max-width: ${BREAKPOINTS.lg - 1}px)`)
const isDesktop = createQuery(`(min-width: ${BREAKPOINTS.lg}px)`)

export function useBreakpoint() {
  return {
    /** < 768px：移动端 */
    isMobile: readonly(isMobile),
    /** 768 ~ 1023px：平板 */
    isTablet: readonly(isTablet),
    /** >= 1024px：桌面 */
    isDesktop: readonly(isDesktop),
  }
}
