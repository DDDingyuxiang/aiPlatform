/**
 * 国际化（i18n）。
 *
 * - 语言包按命名空间拆分在 locales/<locale>/<namespace>.ts，权威来源即这些文件；
 * - 用户选择持久化在 localStorage（app.locale），优先于运行时配置 defaultLocale；
 * - 切换语言时同步 <html lang>，保证无障碍与拼写检查行为正确。
 */
import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN'
import enUS from './locales/en-US'

/** 前端支持的语言集合（新增语言时必须同步补充语言包与 AVAILABLE_LOCALES） */
export type AppLocale = 'zh-CN' | 'en-US'

export interface LocaleOption {
  code: AppLocale
  /** 使用该语言自身的写法展示（不翻译语言名） */
  label: string
  /** 窄空间展示 */
  short: string
}

export const AVAILABLE_LOCALES: LocaleOption[] = [
  { code: 'zh-CN', label: '简体中文', short: '中' },
  { code: 'en-US', label: 'English', short: 'EN' },
]

const FALLBACK_LOCALE: AppLocale = 'zh-CN'
const STORAGE_KEY = 'app.locale'

export const i18n = createI18n({
  legacy: false,
  locale: FALLBACK_LOCALE,
  fallbackLocale: FALLBACK_LOCALE,
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
})

function isSupported(code: string | null | undefined): code is AppLocale {
  return !!code && AVAILABLE_LOCALES.some((option) => option.code === code)
}

function applyLocale(code: AppLocale): void {
  i18n.global.locale.value = code
  document.documentElement.lang = code
}

export function setLocale(code: string): void {
  if (!isSupported(code)) return
  localStorage.setItem(STORAGE_KEY, code)
  applyLocale(code)
}

/** 应用启动时调用一次；defaultLocale 来自运行时配置 app-config.json */
export function initI18n(defaultLocale: string): void {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (isSupported(stored)) applyLocale(stored)
  else if (isSupported(defaultLocale)) applyLocale(defaultLocale)
  else applyLocale(FALLBACK_LOCALE)
}

/** 供非组件上下文（路由守卫等）使用 */
export function translate(key: string, values?: Record<string, unknown>): string {
  return values ? i18n.global.t(key, values) : i18n.global.t(key)
}

/** 按语言环境格式化日期/数字等（Intl 需要 BCP 47 语言标签） */
export function currentIntlLocale(): string {
  return i18n.global.locale.value
}
