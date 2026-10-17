<script setup lang="ts">
/**
 * 全局左侧面板：应用唯一的左侧导航（说明.md · 前端模块规范）。
 * 区块顺序：个人信息（含考勤）→ 对话 / 成员 / 任务 / 知识库 / 公告（模块公开组件）
 *          → 路由入口链接（经营分析、系统管理等，由 app/navigation.ts 按权限过滤）。
 * 移动端（<768px）收入抽屉，由 preferences.mobileNavOpen 控制。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import Icon from '@/shared/components/Icon.vue'
import PanelSection from './PanelSection.vue'
import { panelLinks } from '@/app/navigation'
import { appConfig } from '@/core/config'
import { useAuthStore } from '@/core/auth/store'
import { usePreferencesStore } from '@/core/preferences/store'
import { useBreakpoint } from '@/shared/composables/useBreakpoint'
import { MemberDirectory, ProfileCard } from '@/modules/identity'
import { ConversationList, useChatStore } from '@/modules/chat'
import { TaskSection, useTasksStore } from '@/modules/tasks'
import { ApprovalSection, useWorkflowsStore } from '@/modules/workflows'
import { KnowledgeSection } from '@/modules/knowledge'
import { AnnouncementSection, useAnnouncementsStore } from '@/modules/announcements'

const { t } = useI18n()
const route = useRoute()
const preferences = usePreferencesStore()
const auth = useAuthStore()
const { isMobile } = useBreakpoint()
const chat = useChatStore()
const tasks = useTasksStore()
const workflows = useWorkflowsStore()
const announcements = useAnnouncementsStore()

/** 按当前身份权限过滤路由入口；富区块保持原样 */
const visiblePanelLinks = computed(() =>
  panelLinks.filter((link) => auth.hasAnyPermission(link.permissions)),
)

/** 入口链接的当前页高亮 */
function isActive(prefix: string): boolean {
  return route.path === prefix || route.path.startsWith(`${prefix}/`)
}
</script>

<template>
  <Transition name="fade">
    <div
      v-if="isMobile && preferences.mobileNavOpen"
      class="panel-overlay"
      @click="preferences.closeMobileNav()"
    />
  </Transition>

  <aside class="panel" :class="{ 'panel--open': preferences.mobileNavOpen }">
    <div class="panel__brand">
      <RouterLink
        to="/dashboard"
        class="panel__brand-link"
        :title="t('nav.backHome')"
        :aria-label="t('nav.backHome')"
        @click="preferences.closeMobileNav()"
      >
        <span class="panel__logo"><Icon name="sparkles" :size="17" :stroke-width="2" /></span>
        <span class="panel__brand-name">{{ appConfig.app.shortName }}</span>
      </RouterLink>
      <button
        v-if="isMobile"
        class="icon-btn"
        :aria-label="t('common.close')"
        @click="preferences.closeMobileNav()"
      >
        <Icon name="close" :size="18" />
      </button>
    </div>

    <div class="panel__scroll">
      <ProfileCard />

      <PanelSection
        :title="t('nav.chat')"
        icon="chat"
        :badge="chat.totalUnread || undefined"
        default-open
      >
        <ConversationList />
      </PanelSection>

      <PanelSection :title="t('nav.members')" icon="user">
        <MemberDirectory />
      </PanelSection>

      <PanelSection
        :title="t('nav.tasks')"
        icon="tasks"
        :badge="tasks.pendingCount || undefined"
      >
        <TaskSection />
      </PanelSection>

      <PanelSection
        :title="t('nav.workflows')"
        icon="workflow"
        :badge="workflows.pendingCount || undefined"
      >
        <ApprovalSection />
      </PanelSection>

      <PanelSection :title="t('nav.knowledge')" icon="knowledge">
        <KnowledgeSection />
      </PanelSection>

      <RouterLink
        v-for="link in visiblePanelLinks"
        :key="link.to"
        class="panel__link-card"
        :class="{ 'panel__link-card--active': isActive(link.to) }"
        :to="link.to"
        @click="preferences.closeMobileNav()"
      >
        <Icon :name="link.icon" :size="16" />
        <span class="panel__link-label">{{ t(link.titleKey) }}</span>
        <Icon name="chevron-right" :size="14" class="panel__link-arrow" />
      </RouterLink>

      <PanelSection
        :title="t('nav.announcements')"
        icon="announcement"
        :badge="announcements.unreadCount || undefined"
      >
        <AnnouncementSection />
      </PanelSection>
    </div>
  </aside>
</template>

<style scoped>
.panel {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: var(--z-sticky);
  display: flex;
  flex-direction: column;
  width: var(--sidebar-width);
  background: var(--color-sidebar-bg);
  border-right: 1px solid var(--color-border);
}

/* ---- 品牌区 ---- */
.panel__brand {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  height: var(--header-height);
  padding: 0 var(--space-4);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.panel__brand-link {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.panel__logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: linear-gradient(135deg, var(--color-ai-1), var(--color-ai-2));
  color: #ffffff;
  box-shadow: var(--shadow-xs);
  flex-shrink: 0;
}

.panel__brand-name {
  font-size: var(--font-lg);
  font-weight: var(--weight-semibold);
  color: var(--color-text-1);
  white-space: nowrap;
}

/* ---- 滚动内容 ---- */
.panel__scroll {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3);
}

/*
 * 面板区块必须禁止 flex 收缩：PanelSection 带 overflow: hidden，
 * 其自动最小尺寸为 0，内容超出视口时会被 flex 压扁、文字被裁切
 * （而不是正常滚动）。固定子项高度，溢出交给 .panel__scroll 滚动。
 */
.panel__scroll > * {
  flex-shrink: 0;
}

/* ---- 入口链接（与区块卡片同风格的单行卡片） ---- */
.panel__link-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
  font-size: var(--font-sm);
  font-weight: var(--weight-semibold);
  color: var(--color-text-1);
  transition:
    background-color var(--duration-fast) var(--ease-standard),
    border-color var(--duration-fast) var(--ease-standard);
}

.panel__link-card:hover {
  background: var(--color-surface-2);
  border-color: var(--color-border-strong);
}

.panel__link-card--active {
  background: var(--color-primary-soft);
  border-color: transparent;
  color: var(--color-primary-text);
}

.panel__link-card--active .panel__link-arrow {
  color: currentColor;
}

.panel__link-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel__link-arrow {
  color: var(--color-text-3);
}

/* ---- 移动端：抽屉 ---- */
.panel-overlay {
  position: fixed;
  inset: 0;
  z-index: calc(var(--z-drawer) - 1);
  background: var(--color-overlay);
}

@media (max-width: 767px) {
  .panel {
    z-index: var(--z-drawer);
    width: min(320px, 88vw);
    transform: translateX(-100%);
    transition: transform var(--duration-base) var(--ease-out);
    box-shadow: var(--shadow-lg);
  }

  .panel--open {
    transform: translateX(0);
  }
}
</style>
