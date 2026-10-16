/**
 * 路由 meta 的类型声明。
 *
 * 导航由全局左侧面板（layouts/components/AppPanel.vue）承担：
 * 面板区块直接引用模块公开组件，不再从路由表推导菜单。
 */
import 'vue-router'
import type { IconName } from '@/shared/components/icon-registry'

declare module 'vue-router' {
  interface RouteMeta {
    /** 页面标题的 i18n 键（文档标题 + 头部标题） */
    titleKey?: string
    /** 页面图标（占位视图等处使用） */
    icon?: IconName
    /** 是否需要登录（默认 true，白名单页面显式声明 false） */
    requiresAuth?: boolean
    /** 主区取消内边距与最大宽度（对话等应用型全幅视图） */
    fluid?: boolean
  }
}
