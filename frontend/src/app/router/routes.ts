/**
 * 路由表。导航由全局左侧面板（layouts/components/AppPanel.vue）承担，
 * 面板区块直接引用模块公开组件，路由不再参与菜单推导。
 *
 * meta 约定（见 nav-meta.ts）：titleKey 页面标题 / icon 图标 /
 * requiresAuth（默认 true）/ fluid 主区全幅模式（对话等应用型视图）。
 */
import type { RouteRecordRaw } from 'vue-router'
import MainLayout from '@/layouts/MainLayout.vue'
import NotFoundView from '@/app/views/NotFoundView.vue'
import PlaceholderView from '@/app/views/PlaceholderView.vue'
import { DashboardView } from '@/modules/dashboard'
import { LoginView } from '@/modules/auth'
import { ChatView } from '@/modules/chat'
import { TaskCenterView } from '@/modules/tasks'
import { WorkflowCenterView } from '@/modules/workflows'
import { KnowledgeView } from '@/modules/knowledge'
import { AnalyticsView } from '@/modules/analytics'
import { AnnouncementsView } from '@/modules/announcements'

/** 未开发的模块统一指向占位视图（随迭代逐步替换为真实模块） */
const placeholder = PlaceholderView

export const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: LoginView,
    meta: { requiresAuth: false, titleKey: 'auth.title' },
  },
  {
    path: '/',
    component: MainLayout,
    redirect: { name: 'dashboard' },
    children: [
      {
        path: 'dashboard',
        name: 'dashboard',
        component: DashboardView,
        meta: { titleKey: 'nav.dashboard', icon: 'dashboard' },
      },
      {
        path: 'chat',
        name: 'chat',
        component: ChatView,
        meta: { titleKey: 'nav.chat', icon: 'chat', fluid: true },
      },
      {
        path: 'chat/:conversationId',
        name: 'chat-thread',
        component: ChatView,
        meta: { titleKey: 'nav.chat', icon: 'chat', fluid: true },
      },
      {
        path: 'chat/summaries',
        name: 'summaries',
        component: placeholder,
        meta: { titleKey: 'nav.summaries', icon: 'summary' },
      },
      {
        path: 'tasks',
        name: 'tasks',
        component: TaskCenterView,
        meta: { titleKey: 'nav.tasks', icon: 'tasks' },
      },
      {
        path: 'workflows',
        name: 'workflows',
        component: WorkflowCenterView,
        meta: { titleKey: 'nav.workflows', icon: 'workflow' },
      },
      {
        // 报销并入审批（审批类型的一种），旧入口重定向
        path: 'expenses',
        name: 'expenses',
        redirect: { name: 'workflows' },
      },
      {
        path: 'knowledge',
        name: 'knowledge',
        component: KnowledgeView,
        meta: { titleKey: 'nav.knowledge', icon: 'knowledge' },
      },
      {
        path: 'analytics',
        name: 'analytics',
        component: AnalyticsView,
        meta: { titleKey: 'nav.analytics', icon: 'analytics' },
      },
      {
        path: 'announcements',
        name: 'announcements',
        component: AnnouncementsView,
        meta: { titleKey: 'nav.announcements', icon: 'announcement' },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: NotFoundView,
    meta: { requiresAuth: false, titleKey: 'nav.notFound.title' },
  },
]
