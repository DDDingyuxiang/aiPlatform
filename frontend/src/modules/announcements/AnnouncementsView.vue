<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Icon from '@/shared/components/Icon.vue'
import BaseButton from '@/shared/components/base/BaseButton.vue'
import BaseTag from '@/shared/components/base/BaseTag.vue'
import AnnouncementDetailModal from './components/AnnouncementDetailModal.vue'
import { useAnnouncementsStore } from './store'
import type { Announcement, AnnouncementScope } from './types'
import { formatRelativeTime } from '@/shared/utils/format'
import { toast } from '@/shared/composables/useToast'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const announcements = useAnnouncementsStore()

type TabKey = AnnouncementScope | 'all'

const activeTab = ref<TabKey>('all')

onMounted(() => {
  void announcements.loadAll()
})

const visibleItems = computed(() => announcements.byScope(activeTab.value))

/** 详情由路由 query.open 驱动（面板等入口可深链） */
const activeAnnouncement = computed<Announcement | null>(() => {
  const id = route.query.open
  return typeof id === 'string' && id ? (announcements.byId(id) ?? null) : null
})

watch(
  activeAnnouncement,
  (item) => {
    // 打开即视为已读（后端在详情接口中同样会落库）
    if (item) void announcements.markRead(item.id)
  },
  { immediate: true },
)

function open(id: string): void {
  void router.push({ path: '/announcements', query: { open: id } })
}

function close(): void {
  void router.replace({ path: '/announcements' })
}

function excerpt(item: Announcement): string {
  return item.paragraphs[0] ?? ''
}

function relative(iso: string): string {
  return formatRelativeTime(iso, locale.value, t('common.justNow'))
}

async function markAll(): Promise<void> {
  await announcements.markAllRead()
  toast.success(t('intel.announcements.allRead'))
}

const TABS: TabKey[] = ['all', 'company', 'department', 'colleague']
const SCOPE_TONE: Record<AnnouncementScope, 'primary' | 'info' | 'neutral'> = {
  company: 'primary',
  department: 'info',
  colleague: 'neutral',
}
</script>

<template>
  <div class="notices">
    <header class="notices__hero">
      <div>
        <h2 class="notices__title">{{ t('nav.announcements') }}</h2>
        <p class="notices__subtitle">{{ t('intel.announcements.subtitle') }}</p>
      </div>
      <div class="notices__hero-actions">
        <span v-if="announcements.unreadCount" class="notices__unread">
          {{ t('intel.announcements.unreadCount', { count: announcements.unreadCount }) }}
        </span>
        <BaseButton
          size="sm"
          :disabled="announcements.unreadCount === 0"
          @click="markAll"
        >
          <template #icon><Icon name="check" :size="14" /></template>
          {{ t('intel.announcements.markAllRead') }}
        </BaseButton>
      </div>
    </header>

    <div class="notices__tabs" role="tablist">
      <button
        v-for="tab in TABS"
        :key="tab"
        class="notices__tab"
        :class="{ 'notices__tab--active': activeTab === tab }"
        role="tab"
        :aria-selected="activeTab === tab"
        @click="activeTab = tab"
      >
        {{ t(`intel.announcements.scope.${tab}`) }}
      </button>
    </div>

    <div class="notices__list">
      <button v-for="item in visibleItems" :key="item.id" class="notice" @click="open(item.id)">
        <span class="notice__dot" :class="{ 'notice__dot--unread': !item.read }" />
        <span class="notice__body">
          <span class="notice__title-row">
            <Icon v-if="item.pinned" name="pin" :size="13" class="notice__pin" />
            <span class="notice__title u-truncate">{{ item.title }}</span>
            <BaseTag :tone="SCOPE_TONE[item.scope]" size="sm">
              {{ t(`intel.announcements.scope.${item.scope}`) }}
            </BaseTag>
            <BaseTag v-if="item.scope === 'department' && item.department" tone="neutral" size="sm">
              {{ item.department }}
            </BaseTag>
          </span>
          <span class="notice__excerpt u-clamp-2">{{ excerpt(item) }}</span>
          <span class="notice__meta">
            <span class="notice__publisher">{{ item.publisher.name }}</span>
            <span>{{ relative(item.publishedAt) }}</span>
            <span v-if="item.attachments.length" class="notice__attachment-hint">
              <Icon name="paperclip" :size="12" />
              {{ item.attachments.length }}
            </span>
          </span>
        </span>
      </button>
      <p v-if="visibleItems.length === 0" class="notices__empty">
        {{ t('intel.announcements.empty') }}
      </p>
    </div>

    <AnnouncementDetailModal :announcement="activeAnnouncement" @close="close" />
  </div>
</template>

<style scoped>
.notices {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.notices__hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.notices__title {
  font-size: var(--font-2xl);
  font-weight: var(--weight-semibold);
  color: var(--color-text-1);
}

.notices__subtitle {
  margin-top: 6px;
  font-size: var(--font-md);
  color: var(--color-text-2);
}

.notices__hero-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
}

.notices__unread {
  font-size: var(--font-sm);
  color: var(--color-text-3);
}

.notices__tabs {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  background: var(--color-surface-3);
  border-radius: var(--radius-md);
  align-self: flex-start;
}

.notices__tab {
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  font-size: var(--font-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text-2);
  transition:
    background-color var(--duration-fast) var(--ease-standard),
    color var(--duration-fast) var(--ease-standard);
}

.notices__tab--active {
  background: var(--color-surface);
  color: var(--color-text-1);
  box-shadow: var(--shadow-xs);
}

.notices__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.notice {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-4) var(--space-5);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
  text-align: left;
  transition:
    transform var(--duration-fast) var(--ease-out),
    box-shadow var(--duration-fast) var(--ease-standard);
}

.notice:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

.notice__dot {
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: var(--radius-full);
  border: 1.5px solid var(--color-border-strong);
  flex-shrink: 0;
}

.notice__dot--unread {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.notice__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.notice__title-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.notice__pin {
  color: var(--color-warning);
  flex-shrink: 0;
}

.notice__title {
  font-size: var(--font-md);
  font-weight: var(--weight-medium);
  color: var(--color-text-1);
  min-width: 0;
}

.notice__excerpt {
  font-size: var(--font-sm);
  line-height: 1.6;
  color: var(--color-text-2);
}

.notice__meta {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

.notice__attachment-hint {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.notices__empty {
  padding: var(--space-8);
  text-align: center;
  font-size: var(--font-sm);
  color: var(--color-text-3);
}
</style>
