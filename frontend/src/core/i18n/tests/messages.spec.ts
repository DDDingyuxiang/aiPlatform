/**
 * 语言包编译回归测试。
 *
 * vue-i18n 会在首次使用时编译消息；`@` 等特殊字符若未按语法转义，
 * 会在渲染阶段抛错（例如员工表单邮箱占位符曾导致弹窗整体无法渲染）。
 */
import { describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import zhCN from '../locales/zh-CN'
import enUS from '../locales/en-US'

const LOCALES = {
  'zh-CN': zhCN,
  'en-US': enUS,
} as const

function flattenKeys(messages: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(messages).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') return [path]
    if (typeof value === 'object' && value !== null) {
      return flattenKeys(value as Record<string, unknown>, path)
    }
    return []
  })
}

describe('i18n messages', () => {
  for (const [locale, messages] of Object.entries(LOCALES)) {
    it(`${locale} 的消息全部可以编译`, () => {
      const instance = createI18n({
        legacy: false,
        locale,
        fallbackLocale: locale,
        messages: { [locale]: messages },
      })
      // 部分消息含占位参数，单独调用 t 会产生缺少参数的告警，不影响编译
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      for (const key of flattenKeys(messages)) {
        expect(() => instance.global.t(key), key).not.toThrow()
      }

      warn.mockRestore()
    })
  }

  it('邮箱占位符中的 @ 按字面量渲染', () => {
    const instance = createI18n({
      legacy: false,
      locale: 'zh-CN',
      fallbackLocale: 'zh-CN',
      messages: { 'zh-CN': zhCN },
    })

    expect(instance.global.t('system.form.emailPlaceholder')).toBe('name@example.com')
  })
})
