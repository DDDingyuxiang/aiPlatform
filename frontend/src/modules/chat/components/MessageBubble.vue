<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseAvatar from '@/shared/components/base/BaseAvatar.vue'
import { formatDateTime } from '@/shared/utils/format'
import type { Conversation, Message } from '../types'

const props = defineProps<{
  message: Message
  conversation: Conversation
  /** 是否为我发出的消息 */
  mine: boolean
  senderName: string
}>()

const { locale } = useI18n()

const timeTitle = computed(() => formatDateTime(props.message.sentAt, locale.value))
</script>

<template>
  <div class="msg" :class="{ 'msg--mine': mine }">
    <BaseAvatar v-if="!mine" :name="senderName" :size="32" class="msg__avatar" />
    <div class="msg__content">
      <p v-if="!mine && conversation.type === 'group'" class="msg__sender">{{ senderName }}</p>
      <div class="msg__bubble" :title="timeTitle">{{ message.content }}</div>
    </div>
  </div>
</template>

<style scoped>
.msg {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
}

.msg--mine {
  flex-direction: row-reverse;
}

.msg__avatar {
  margin-top: 2px;
}

.msg__content {
  display: flex;
  flex-direction: column;
  max-width: min(72%, 560px);
}

.msg--mine .msg__content {
  align-items: flex-end;
}

.msg__sender {
  margin: 0 4px 4px;
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

.msg__bubble {
  padding: 9px 12px;
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  font-size: var(--font-md);
  line-height: 1.6;
  color: var(--color-text-1);
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: break-word;
}

.msg--mine .msg__bubble {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-primary-contrast);
}
</style>
