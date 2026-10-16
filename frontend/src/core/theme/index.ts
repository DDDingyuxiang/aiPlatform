/**
 * 主题管理器：负责「当前主题模式」的解析、持久化与 DOM 应用。
 *
 * 令牌值的唯一来源是 tokens/*.css（light.css / dark.css）；
 * 本模块不持有任何颜色值（theme-color meta 的两处常量除外），
 * 只负责在 <html data-theme="light|dark"> 之间切换。
 *
 * 首屏由 index.html 内联脚本先行解析并写入 data-theme（避免闪烁），
 * 本模块在应用启动时以持久化偏好/运行时配置为准再次确认。
 */
import { computed, readonly, ref, type ComputedRef, type Ref } from 'vue'
import type { ThemeMode } from '@/core/config/types'

export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'app.theme.mode'

/** 深色主题下浏览器地址栏/状态栏颜色，与 tokens/dark.css 的 --color-bg 保持一致 */
const META_THEME_COLOR: Record<ResolvedTheme, string> = {
  light: '#ffffff',
  dark: '#0e1119',
}

const media = window.matchMedia('(prefers-color-scheme: dark)')

const mode: Ref<ThemeMode> = ref('system')
const resolved: Ref<ResolvedTheme> = ref('light')

function resolveMode(m: ThemeMode): ResolvedTheme {
  if (m === 'system') return media.matches ? 'dark' : 'light'
  return m
}

function apply(): void {
  document.documentElement.dataset.theme = resolved.value
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', META_THEME_COLOR[resolved.value])
}

function isValidMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system'
}

/** 应用启动时调用一次；defaultMode 来自运行时配置 app-config.json */
export function initTheme(defaultMode: ThemeMode = 'system'): void {
  const stored = localStorage.getItem(STORAGE_KEY)
  mode.value = isValidMode(stored) ? stored : defaultMode
  resolved.value = resolveMode(mode.value)
  apply()
  media.addEventListener('change', () => {
    if (mode.value === 'system') {
      resolved.value = resolveMode('system')
      apply()
    }
  })
}

export function setThemeMode(next: ThemeMode): void {
  mode.value = next
  localStorage.setItem(STORAGE_KEY, next)
  resolved.value = resolveMode(next)
  apply()
}

/** 读取当前主题下某个令牌的最终值（图表等无法直接使用 CSS 变量的场景） */
export function readToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export function useTheme(): {
  mode: Readonly<Ref<ThemeMode>>
  resolved: Readonly<Ref<ResolvedTheme>>
  setMode: typeof setThemeMode
} {
  return { mode: readonly(mode), resolved: readonly(resolved), setMode: setThemeMode }
}

/** 响应式读取一组令牌值，主题切换时自动更新（供 SVG 图表等使用） */
export function useThemeTokens(names: readonly string[]): ComputedRef<Record<string, string>> {
  return computed(() => {
    void resolved.value // 建立依赖：主题变化时重新读取
    const result: Record<string, string> = {}
    for (const name of names) result[name] = readToken(name)
    return result
  })
}
