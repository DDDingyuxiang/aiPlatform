/**
 * 路由鉴权与标题守卫。
 *
 * 约定：路由 meta.requiresAuth 默认为 true（默认安全）；白名单页面显式声明 false。
 * 注意：此守卫只做前端引导，接口权限由后端强制校验。
 */
import type { Router } from 'vue-router'
import { syncPermissionRoutes } from '@/app/router/permission-routes'
import { appConfig } from '@/core/config'
import { translate } from '@/core/i18n'
import { useAuthStore } from './store'

export function registerAuthGuard(router: Router): void {
  router.beforeEach((to) => {
    const auth = useAuthStore()
    const requiresAuth = to.meta.requiresAuth !== false

    if (requiresAuth && !auth.isAuthenticated) {
      return {
        name: 'login',
        query: to.fullPath && to.fullPath !== '/' ? { redirect: to.fullPath } : {},
      }
    }
    if (to.name === 'login' && auth.isAuthenticated) {
      return { name: 'dashboard' }
    }

    if (auth.isAuthenticated) {
      // 首次访问动态路由时，to 可能已匹配到 404；挂载后按原地址重试一次
      const changed = syncPermissionRoutes(router, auth.permissions)
      if (changed && to.name === 'not-found') {
        const resolved = router.resolve(to.fullPath)
        if (resolved.name !== 'not-found') {
          return { path: to.fullPath, replace: true }
        }
      }

      // 路由级兜底：动态路由已按权限注册，此处防御残留路由或权限瞬时变化
      if (to.meta.permissions && !auth.hasAnyPermission(to.meta.permissions)) {
        return { name: 'forbidden' }
      }
    }

    return true
  })

  router.afterEach((to) => {
    const titleKey = to.meta.titleKey as string | undefined
    const pageTitle = titleKey ? translate(titleKey) : ''
    document.title = pageTitle
      ? `${pageTitle} · ${appConfig.app.productName}`
      : appConfig.app.productName
  })
}
