/**
 * 应用启动入口（应用组装层）：
 *   运行时配置 → 主题 → 国际化 → Mock 层 → Pinia/路由 → 挂载
 * 启动顺序有依赖关系，调整前请确认不会破坏以下约束：
 *   - 主题/语言初始化依赖运行时配置（默认值来源）；
 *   - 用户资料刷新先于挂载，避免路由守卫误判产生登录页闪跳。
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'

// 全局样式顺序：重置 → 设计令牌 → 全局元素样式
import '@/assets/styles/reset.css'
import '@/core/theme/tokens/base.css'
import '@/core/theme/tokens/light.css'
import '@/core/theme/tokens/dark.css'
import '@/assets/styles/global.css'

import App from './App.vue'
import router from './router'
import { registerMocks } from './register-mocks'
import { appConfig, initAppConfig } from '@/core/config'
import { i18n, initI18n } from '@/core/i18n'
import { initTheme } from '@/core/theme'
import { useAuthStore } from '@/core/auth/store'
import { getToken } from '@/core/auth/token'

async function bootstrap(): Promise<void> {
  // 1. 运行时配置（产品名、默认语言/主题、功能开关），失败自动回退内置默认值
  await initAppConfig()

  // 2. 主题与语言（用户持久化偏好优先于运行时配置默认值）
  initTheme(appConfig.defaultTheme)
  initI18n(appConfig.defaultLocale)

  // 3. Mock 数据层（仅 features.mockApi 开启时注册）
  await registerMocks()

  const app = createApp(App)
  const pinia = createPinia()
  app.use(pinia)
  app.use(i18n)
  app.use(router)

  // 4. 已有令牌时先校验并同步用户资料
  const auth = useAuthStore(pinia)
  if (getToken()) await auth.refreshProfile()

  app.mount('#app')
}

bootstrap().catch((error) => {
  console.error('[app] 启动失败', error)
})
