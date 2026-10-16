/**
 * 运行时配置（app-config.json）的类型定义。
 * 该文件由前端在启动时从 BASE_URL/app-config.json 加载，
 * 只包含非敏感、可运行时调整的产品级配置；密钥类信息一律不进入前端。
 */

export type ThemeMode = 'light' | 'dark' | 'system'

export interface AppMetaConfig {
  /** 产品全名，用于登录页、浏览器标题 */
  productName: string
  /** 产品短名，用于侧边栏、窄空间 */
  shortName: string
  version: string
  /** 后端 API 前缀（含版本号） */
  apiBaseUrl: string
}

export interface FeatureFlags {
  /** 使用前端 Mock 数据层（后端未就绪时开启；上线前必须关闭） */
  mockApi: boolean
  /** 全局 AI 助手抽屉入口 */
  aiAssistant: boolean
  /** 知识库 AI 问答 */
  knowledgeQa: boolean
  /** 公告发布功能（仅控制功能可见性，权限仍由后端与角色校验） */
  publishAnnouncements: boolean
}

export interface AppConfig {
  app: AppMetaConfig
  /** 默认界面语言（可用值见 core/i18n，无效时回退 zh-CN） */
  defaultLocale: string
  /** 默认主题模式，用户手动切换后以用户偏好为准 */
  defaultTheme: ThemeMode
  features: FeatureFlags
}
