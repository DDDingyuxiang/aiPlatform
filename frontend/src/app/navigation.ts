/**
 * 左侧面板的入口链接注册表。
 *
 * 面板区块（对话、成员、任务等富组件）仍由 AppPanel 直接引用；
 * 纯路由入口在这里声明，AppPanel 按当前身份权限过滤渲染。
 */
import type { PermissionCodeValue } from '@aiplatform/contracts'
import {
  EMPLOYEE_MANAGE_PERMISSION,
  SUPER_ADMIN_PERMISSION,
} from '@/core/auth/permissions'
import type { IconName } from '@/shared/components/icon-registry'

export interface PanelLink {
  to: string
  /** 标题 i18n 键，保证切换语言即时生效 */
  titleKey: string
  icon: IconName
  /** 任一权限满足即可；未声明表示所有登录用户可见 */
  permissions?: PermissionCodeValue[]
}

export const panelLinks: PanelLink[] = [
  {
    to: '/analytics',
    titleKey: 'nav.analytics',
    icon: 'analytics',
  },
  {
    to: '/system/users',
    titleKey: 'nav.systemUsers',
    icon: 'settings',
    permissions: [SUPER_ADMIN_PERMISSION, EMPLOYEE_MANAGE_PERMISSION],
  },
]
