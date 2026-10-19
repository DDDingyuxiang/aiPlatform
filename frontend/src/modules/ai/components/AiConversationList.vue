<script setup lang="ts">
/** AI 会话列表：新建、切换、删除（删除需二次确认） */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/shared/components/Icon.vue'
import BaseButton from '@/shared/components/base/BaseButton.vue'
import { formatRelativeTime } from '@/shared/utils/format'
import type { AiConversation } from '../types'

const props = defineProps<{
  conversations: AiConversation[]
  activeId: string | null
  disabled?: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
  create: []
  delete: [id: string]
}>()

const { t, locale } = useI18n()
const pendingDeleteId = ref<string | null>(null)

function requestDelete(id: string): void {
  if (pendingDeleteId.value === id) {
    pendingDeleteId.value = null
    emit('delete', id)
    return
  }
  pendingDeleteId.value = id
}

function select(id: string): void {
  pendingDeleteId.value = null
  emit('select', id)
}
</script>

<template>
  <aside class="ai-sidebar">
    <div class="ai-sidebar__head">
      <span class="ai-sidebar__label">{{ t('ai.conversations') }}</span>
      <BaseButton
        variant="ghost"
        size="sm"
        :disabled="disabled"
        @click="emit('create')"
      >
        <template #icon><Icon name="plus" :size="14" /></template>
        {{ t('ai.newChat') }}
      </BaseButton>
    </div>

    <div class="ai-sidebar__list">
      <div
        v-for="conversation in props.conversations"
        :key="conversation.id"
        class="ai-sidebar__item"
        :class="{ 'ai-sidebar__item--active': conversation.id === activeId }"
        role="button"
        tabindex="0"
        @click="select(conversation.id)"
        @keydown.enter="select(conversation.id)"
      >
        <div class="ai-sidebar__item-main">
          <span class="ai-sidebar__item-title">{{ conversation.title }}</span>
          <span class="ai-sidebar__item-preview">
            {{ conversation.lastMessage || t('ai.emptyPreview') }}
          </span>
          <span class="ai-sidebar__item-meta">
            {{ formatRelativeTime(conversation.updatedAt, locale, t('ai.justNow')) }}
          </span>
        </div>
        <button
          type="button"
          class="ai-sidebar__delete"
          :class="{ 'ai-sidebar__delete--confirm': pendingDeleteId === conversation.id }"
          :title="
            pendingDeleteId === conversation.id
              ? t('ai.confirmDelete')
              : t('ai.deleteChat')
          "
          :disabled="disabled"
          @click.stop="requestDelete(conversation.id)"
        >
          <Icon
            :name="pendingDeleteId === conversation.id ? 'check' : 'trash'"
            :size="14"
          />
        </button>
      </div>

      <p v-if="props.conversations.length === 0" class="ai-sidebar__empty">
        {{ t('ai.noConversations') }}
      </p>
    </div>
  </aside>
</template>

<style scoped>
.ai-sidebar {
  display: flex;
  flex-direction: column;
  width: 244px;
  flex-shrink: 0;
  border-right: 1px solid var(--color-border);
  background: var(--color-surface);
  min-height: 0;
}

.ai-sidebar__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-3) var(--space-2);
}

.ai-sidebar__label {
  font-size: var(--font-xs);
  font-weight: var(--weight-semibold);
  color: var(--color-text-3);
  letter-spacing: 0.04em;
}

.ai-sidebar__list {
  flex: 1;
  overflow-y: auto;
  padding: 0 var(--space-2) var(--space-3);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ai-sidebar__item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: 8px 10px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background-color var(--duration-fast) var(--ease-standard);
}

.ai-sidebar__item:hover {
  background: var(--color-surface-hover, var(--color-ai-soft));
}

.ai-sidebar__item--active {
  background: var(--color-ai-soft);
}

.ai-sidebar__item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ai-sidebar__item-title {
  font-size: var(--font-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ai-sidebar__item-preview {
  font-size: var(--font-xs);
  color: var(--color-text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ai-sidebar__item-meta {
  font-size: var(--font-xs);
  color: var(--color-text-3);
  opacity: 0.8;
}

.ai-sidebar__delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  color: var(--color-text-3);
  opacity: 0;
  transition:
    opacity var(--duration-fast) var(--ease-standard),
    color var(--duration-fast) var(--ease-standard),
    background-color var(--duration-fast) var(--ease-standard);
}

.ai-sidebar__item:hover .ai-sidebar__delete,
.ai-sidebar__delete--confirm {
  opacity: 1;
}

.ai-sidebar__delete:hover {
  color: var(--color-danger-text);
  background: var(--color-danger-soft);
}

.ai-sidebar__delete--confirm {
  color: var(--color-danger-text);
  background: var(--color-danger-soft);
}

.ai-sidebar__empty {
  padding: var(--space-4) var(--space-3);
  font-size: var(--font-xs);
  color: var(--color-text-3);
  text-align: center;
}

@media (max-width: 767px) {
  .ai-sidebar {
    position: absolute;
    inset: 0 auto 0 0;
    z-index: 20;
    width: min(78vw, 300px);
    box-shadow: var(--shadow-lg, 0 10px 30px rgb(0 0 0 / 18%));
  }
}
</style>
