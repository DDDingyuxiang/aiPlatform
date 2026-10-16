/**
 * 登录流程集成测试：真实组件 + 真实路由守卫 + Mock HTTP 层。
 * 覆盖：未登录重定向、登录成功跳转工作台、密码错误停留并提示。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import App from '@/app/App.vue'
import { routes } from '@/app/router/routes'
import { registerAuthGuard } from '@/core/auth/guard'
import { clearToken } from '@/core/auth/token'
import { i18n } from '@/core/i18n'
import '@/core/auth/mock' // 注册认证 Mock 端点（注册表为模块级，重复导入无副作用）
import '@/modules/identity/mock' // 左侧面板挂载后会请求通讯录/考勤
import '@/modules/chat/mock' // 左侧面板挂载后会请求会话列表
import '@/modules/tasks/mock' // 面板「任务」区块
import '@/modules/workflows/mock' // 面板「审批」区块
import '@/modules/knowledge/mock' // 面板「知识库」区块
import '@/modules/analytics/mock' // 经营分析页
import '@/modules/announcements/mock' // 面板「公告」区块

async function mountApp(): Promise<{ wrapper: VueWrapper; router: Router }> {
  const router = createRouter({ history: createMemoryHistory(), routes })
  registerAuthGuard(router)
  const wrapper = mount(App, { global: { plugins: [createPinia(), i18n, router] } })
  return { wrapper, router }
}

describe('登录流程', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    clearToken() // token 为模块级响应式状态，测试间必须复位
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('未登录访问工作台时重定向到登录页', async () => {
    const { router } = await mountApp()
    await router.push('/dashboard')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/dashboard')
  })

  it('使用演示账号登录成功后跳转到工作台', async () => {
    const { wrapper, router } = await mountApp()
    await router.push('/login')
    await flushPromises()

    await wrapper.find('input[autocomplete="username"]').setValue('admin')
    await wrapper.find('input[autocomplete="current-password"]').setValue('123456')
    await wrapper.find('form').trigger('submit')

    // 推进 Mock 延迟（300ms）并等待异步链路完成
    await vi.advanceTimersByTimeAsync(500)
    await flushPromises()

    expect(localStorage.getItem('app.auth.token')).toBeTruthy()
    expect(router.currentRoute.value.name).toBe('dashboard')
  })

  it('密码错误时停留在登录页并提示错误', async () => {
    const { wrapper, router } = await mountApp()
    await router.push('/login')
    await flushPromises()

    await wrapper.find('input[autocomplete="username"]').setValue('admin')
    await wrapper.find('input[autocomplete="current-password"]').setValue('wrong-password')
    await wrapper.find('form').trigger('submit')
    await vi.advanceTimersByTimeAsync(500)
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('login')
    expect(wrapper.text()).toContain('用户名或密码错误')
  })
})
