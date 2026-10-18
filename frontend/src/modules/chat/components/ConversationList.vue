<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import BaseAvatar from '@/shared/components/base/BaseAvatar.vue'
import { usePreferencesStore } from '@/core/preferences/store'
import { formatRelativeTime } from '@/shared/utils/format'
import { useChatStore } from '../store'
import type { Conversation } from '../types'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const preferences = usePreferencesStore()
const chat = useChatStore()

onMounted(() => {
  void chat.loadConversations()
})

const activeId = computed(() =>
  typeof route.params.conversationId === 'string' ? route.params.conversationId : null,
)

const sections = computed(() =>
  [
    { key: 'direct', label: t('panel.chatList.direct'), items: chat.directConversations },
    { key: 'group', label: t('panel.chatList.group'), items: chat.groupConversations },
  ].filter((section) => section.items.length > 0),
)

function open(conversation: Conversation): void {
  preferences.closeMobileNav()
  void router.push(`/messages/${conversation.id}`)
}

function time(iso: string): string {
  return formatRelativeTime(iso, locale.value, t('common.justNow'))
}
</script>

<template>
  <div class="conv">
    <template v-for="section in sections" :key="section.key">
      <p class="conv__label">{{ section.label }}</p>
      <ul class="conv__list">
        <li v-for="conversation in section.items" :key="conversation.id">
          <button
            class="conv-item"
            :class="{ 'conv-item--active': conversation.id === activeId }"
            @click="open(conversation)"
          >
            <BaseAvatar
              :name="conversation.name"
              :size="34"
              :shape="conversation.type === 'group' ? 'square' : 'circle'"
            />
            <span class="conv-item__body">
              <span class="conv-item__row">
                <span class="conv-item__name u-truncate">{{ conversation.name }}</span>
                <time class="conv-item__time">{{ time(conversation.updatedAt) }}</time>
              </span>
              <span class="conv-item__row">
                <span class="conv-item__preview u-truncate">
                  {{ conversation.lastMessage || t('panel.chatList.empty') }}
                </span>
                <span v-if="conversation.unread" class="conv-item__badge u-tabular">
                  {{ conversation.unread > 99 ? '99+' : conversation.unread }}
                </span>
              </span>
            </span>
          </button>
        </li>
      </ul>
    </template>

    <p v-if="sections.length === 0" class="conv__empty">{{ t('panel.chatList.empty') }}</p>
  </div>
</template>

<style scoped>
.conv {
  display: flex;
  flex-direction: column;
}

.conv__label {
  padding: 4px 8px 2px;
  font-size: var(--font-xs);
  font-weight: var(--weight-medium);
  color: var(--color-text-3);
}

.conv__list + .conv__label {
  margin-top: var(--space-2);
}

.conv__list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.conv-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: 7px 8px;
  border-radius: var(--radius-md);
  text-align: left;
  transition: background-color var(--duration-fast) var(--ease-standard);
}

.conv-item:hover {
  background: var(--color-surface-3);
}

.conv-item--active {
  background: var(--color-primary-soft);
}

.conv-item__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.conv-item__row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.conv-item__name {
  flex: 1;
  min-width: 0;
  font-size: var(--font-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text-1);
}

.conv-item--active .conv-item__name {
  color: var(--color-primary-text);
}

.conv-item__time {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--color-text-3);
}

.conv-item__preview {
  flex: 1;
  min-width: 0;
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

.conv-item__badge {
  flex-shrink: 0;
  min-width: 17px;
  height: 17px;
  padding: 0 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-full);
  background: var(--color-primary);
  color: var(--color-primary-contrast);
  font-size: 11px;
  line-height: 1;
}

.conv__empty {
  padding: var(--space-3) 8px;
  font-size: var(--font-xs);
  color: var(--color-text-3);
  text-align: center;
}
</style>
