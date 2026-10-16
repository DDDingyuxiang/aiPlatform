import { createRouter, createWebHistory } from 'vue-router'
import { registerAuthGuard } from '@/core/auth/guard'
import { routes } from './routes'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

// 鉴权与文档标题守卫（见 core/auth/guard.ts）
registerAuthGuard(router)

export default router
