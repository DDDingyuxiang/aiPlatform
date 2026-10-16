import type { AppConfig } from './types'

/**
 * 内置默认配置：app-config.json 缺失、字段非法或加载失败时逐字段回退。
 * 修改默认值时必须同步更新 public/app-config.json 与文档。
 */
export const DEFAULT_CONFIG: AppConfig = {
  app: {
    productName: '智擎 AI 智能工作流平台',
    shortName: '智擎 AI',
    version: '0.1.0',
    apiBaseUrl: '/api/v1',
  },
  defaultLocale: 'zh-CN',
  defaultTheme: 'system',
  features: {
    mockApi: true,
    aiAssistant: true,
    knowledgeQa: true,
    publishAnnouncements: true,
  },
}
