<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Icon from '@/shared/components/Icon.vue'
import { usePreferencesStore } from '@/core/preferences/store'
import { formatRelativeTime } from '@/shared/utils/format'
import { useAnnouncementsStore } from '../store'

const { t, locale } = useI18n()
const router = useRouter()
const preferences = usePreferencesStore()
const announcements = useAnnouncementsStore()

onMounted(() => {
  void announcements.loadAll()
})

function open(id: string): void {
  preferences.closeMobileNav()
  void router.push({ path: '/announcements', query: { open: id } })
}

function relative(iso: string): string {
  return formatRelativeTime(iso, locale.value, t('common.justNow'))
}
</script>

<template>
  <div class="notice-brief">
    <ul v-if="announcements.recentItems.length" class="notice-brief__list">
      <li v-for="item in announcements.recentItems" :key="item.id">
        <button class="notice-brief__item" @click="open(item.id)">
          <span class="notice-brief__dot" :class="{ 'notice-brief__dot--unread': !item.read }" />
          <span class="notice-brief__body">
            <span class="notice-brief__title-row">
              <Icon v-if="item.pinned" name="pin" :size="12" class="notice-brief__pin" />
              <span class="notice-brief__title u-truncate">{{ item.title }}</span>
            </span>
            <span class="notice-brief__meta">{{ item.publisher.name }} · {{ relative(item.publishedAt) }}</span>
          </span>
        </button>
      </li>
    </ul>
    <p v-else class="notice-brief__empty">{{ t('intel.announcements.empty') }}</p>

    <RouterLink to="/announcements" class="notice-brief__all" @click="preferences.closeMobileNav()">
      {{ t('common.viewAll') }}
      <Icon name="chevron-right" :size="13" />
    </RouterLink>
  </div>
</template>

<style scoped>
.notice-brief {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.notice-brief__list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.notice-brief__item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  width: 100%;
  padding: 7px 8px;
  border-radius: var(--radius-md);
  text-align: left;
  transition: background-color var(--duration-fast) var(--ease-standard);
}

.notice-brief__item:hover {
  background: var(--color-surface-3);
}

.notice-brief__dot {
  width: 7px;
  height: 7px;
  margin-top: 5px;
  border-radius: var(--radius-full);
  border: 1.5px solid var(--color-border-strong);
  flex-shrink: 0;
}

.notice-brief__dot--unread {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.notice-brief__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.notice-brief__title-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.notice-brief__pin {
  color: var(--color-warning);
  flex-shrink: 0;
}

.notice-brief__title {
  font-size: var(--font-sm);
  color: var(--color-text-1);
  min-width: 0;
}

.notice-brief__meta {
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

.notice-brief__empty {
  padding: var(--space-3) 8px;
  font-size: var(--font-xs);
  color: var(--color-text-3);
  text-align: center;
}

.notice-brief__all {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  align-self: flex-end;
  margin-top: 4px;
  padding: 3px 4px;
  font-size: var(--font-xs);
  color: var(--color-primary-text);
}

.notice-brief__all:hover {
  text-decoration: underline;
}
</style>
