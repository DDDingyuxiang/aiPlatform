/**
 * Mock 数据层注册入口（应用组装层职责）。
 *
 * - 仅在运行时配置 features.mockApi 开启时动态导入各 Mock 模块；
 * - 各模块的 mock 文件在导入时自行注册端点（见 core/http/mock.ts）；
 * - 后端就绪后将开关置为 false 即可整体关闭，业务代码零改动。
 */
import { appConfig } from '@/core/config'

export async function registerMocks(): Promise<void> {
  if (!appConfig.features.mockApi) return
  await Promise.all([
    import('@/core/auth/mock'),
    import('@/modules/identity/mock'),
    import('@/modules/chat/mock'),
    import('@/modules/tasks/mock'),
    import('@/modules/workflows/mock'),
    import('@/modules/knowledge/mock'),
    import('@/modules/analytics/mock'),
    import('@/modules/announcements/mock'),
    import('@/modules/system/mock'),
  ])
}
