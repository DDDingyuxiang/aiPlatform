/**
 * 静态路由表（登录、工作台与所有登录用户可访问的页面）。
 * 导航由全局左侧面板（layouts/components/AppPanel.vue）承担，面板区块直接
 * 引用模块公开组件；需要权限的路由见 permission-routes.ts，登录后动态挂载。
 *
 * meta 约定（见 nav-meta.ts）：titleKey 页面标题 / icon 图标 /
 * requiresAuth（默认 true）/ fluid 主区全幅模式 / permission 所需权限码。
 */
import type { RouteRecordRaw } from 'vue-router'
import MainLayout from '@/layouts/MainLayout.vue'
import ForbiddenView from '@/app/views/ForbiddenView.vue'
import NotFoundView from '@/app/views/NotFoundView.vue'
import PlaceholderView from '@/app/views/PlaceholderView.vue'
import { DashboardView } from '@/modules/dashboard'
import { LoginView, ProfileView } from '@/modules/auth'
import { AiChatView } from '@/modules/ai'
import { ChatView } from '@/modules/chat'
import { MemberProfileView } from '@/modules/identity'
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
    name: 'main',
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
        path: 'profile',
        name: 'profile',
        component: ProfileView,
        meta: { titleKey: 'auth.profile', icon: 'user' },
      },
      {
        path: 'members/:memberId',
        name: 'member-profile',
        component: MemberProfileView,
        meta: { titleKey: 'nav.members', icon: 'user' },
      },
      {
        // 员工私聊/群聊（与「智能对话」的 AI 问答相互独立）
        path: 'messages/:conversationId',
        name: 'messages-thread',
        component: ChatView,
        meta: { titleKey: 'nav.messages', icon: 'chat', fluid: true },
      },
      {
        // 智能对话：直接向 AI 提问
        path: 'chat',
        name: 'chat',
        component: AiChatView,
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
    path: '/forbidden',
    name: 'forbidden',
    component: ForbiddenView,
    meta: { requiresAuth: true, titleKey: 'nav.forbidden.title' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: NotFoundView,
    meta: { requiresAuth: false, titleKey: 'nav.notFound.title' },
  },
]
