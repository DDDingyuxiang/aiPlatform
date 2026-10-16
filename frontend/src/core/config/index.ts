/**
 * 运行时配置加载与校验。
 *
 * - 权威来源：public/app-config.json（部署时可替换，无需重新构建）
 * - 策略：逐字段校验类型，非法/缺失字段回退内置默认值并输出告警；
 *   未知字段输出告警但忽略（防止拼错字段名后静默失效）。
 * - 敏感信息绝不进入本配置。
 */
import { reactive } from 'vue'
import type { AppConfig, ThemeMode } from './types'
import { DEFAULT_CONFIG } from './defaults'

export type { AppConfig, AppMetaConfig, FeatureFlags, ThemeMode } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system'
}

function pickString(
  source: Record<string, unknown>,
  key: string,
  fallback: string,
  path: string,
  issues: string[],
): string {
  const value = source[key]
  if (value === undefined) return fallback
  if (typeof value !== 'string' || value.trim() === '') {
    issues.push(`${path} 应为非空字符串，已回退默认值「${fallback}」`)
    return fallback
  }
  return value
}

function pickBoolean(
  source: Record<string, unknown>,
  key: string,
  fallback: boolean,
  path: string,
  issues: string[],
): boolean {
  const value = source[key]
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') {
    issues.push(`${path} 应为布尔值，已回退默认值「${fallback}」`)
    return fallback
  }
  return value
}

export function validateAppConfig(raw: unknown): { config: AppConfig; issues: string[] } {
  const issues: string[] = []
  const base: AppConfig = structuredClone(DEFAULT_CONFIG)

  if (raw === null || raw === undefined) return { config: base, issues }
  if (!isRecord(raw)) {
    issues.push('配置根节点必须是 JSON 对象，已整体回退默认配置')
    return { config: base, issues }
  }

  let app: Record<string, unknown> = {}
  if (isRecord(raw.app)) {
    app = raw.app
  } else if (raw.app !== undefined) {
    issues.push('app 段格式错误，已回退默认值')
  }
  base.app.productName = pickString(app, 'productName', base.app.productName, 'app.productName', issues)
  base.app.shortName = pickString(app, 'shortName', base.app.shortName, 'app.shortName', issues)
  base.app.version = pickString(app, 'version', base.app.version, 'app.version', issues)
  base.app.apiBaseUrl = pickString(app, 'apiBaseUrl', base.app.apiBaseUrl, 'app.apiBaseUrl', issues)

  base.defaultLocale = pickString(raw, 'defaultLocale', base.defaultLocale, 'defaultLocale', issues)

  const theme = raw.defaultTheme
  if (theme !== undefined) {
    if (isThemeMode(theme)) base.defaultTheme = theme
    else issues.push(`defaultTheme 必须是 light/dark/system 之一，已回退「${base.defaultTheme}」`)
  }

  if (raw.features !== undefined && !isRecord(raw.features)) {
    issues.push('features 段格式错误，已回退默认值')
  }
  const features = isRecord(raw.features) ? raw.features : {}
  for (const key of Object.keys(features)) {
    if (!(key in base.features)) issues.push(`features.${key} 不是已知开关，已忽略`)
  }
  for (const key of Object.keys(base.features) as (keyof typeof base.features)[]) {
    base.features[key] = pickBoolean(features, key, base.features[key], `features.${key}`, issues)
  }

  for (const key of Object.keys(raw)) {
    if (!['app', 'defaultLocale', 'defaultTheme', 'features'].includes(key)) {
      issues.push(`未知配置项 ${key}，已忽略`)
    }
  }

  return { config: base, issues }
}

/** 全局运行时配置（在 initAppConfig 之前为内置默认值） */
export const appConfig = reactive<AppConfig>(structuredClone(DEFAULT_CONFIG))

export async function initAppConfig(): Promise<void> {
  let raw: unknown = null
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}app-config.json`, { cache: 'no-cache' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    raw = await response.json()
  } catch (error) {
    console.warn('[config] app-config.json 加载失败，使用内置默认配置', error)
  }
  const { config, issues } = validateAppConfig(raw)
  for (const issue of issues) console.warn(`[config] ${issue}`)
  Object.assign(appConfig, config)
}
