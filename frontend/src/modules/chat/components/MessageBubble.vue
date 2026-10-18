<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseAvatar from '@/shared/components/base/BaseAvatar.vue'
import { formatDateTime } from '@/shared/utils/format'
import MessageAttachmentItem from './MessageAttachmentItem.vue'
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
const hasText = computed(() => props.message.content.trim().length > 0)
</script>

<template>
  <!-- 系统消息（例如 AI 创建任务通知）居中展示，不显示头像与发送者 -->
  <div v-if="message.type === 'system'" class="msg-system" :title="timeTitle">
    {{ message.content }}
  </div>

  <div v-else class="msg" :class="{ 'msg--mine': mine }">
    <BaseAvatar v-if="!mine" :name="senderName" :size="32" class="msg__avatar" />
    <div class="msg__content">
      <p v-if="!mine && conversation.type === 'group'" class="msg__sender">{{ senderName }}</p>
      <div
        class="msg__bubble"
        :class="{ 'msg__bubble--media': !hasText && message.attachments.length > 0 }"
        :title="timeTitle"
      >
        <p v-if="hasText" class="msg__text">{{ message.content }}</p>
        <div v-if="message.attachments.length" class="msg__attachments">
          <MessageAttachmentItem
            v-for="attachment in message.attachments"
            :key="attachment.id"
            :conversation-id="message.conversationId"
            :attachment="attachment"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.msg {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
}

.msg-system {
  align-self: center;
  max-width: 86%;
  padding: 6px 12px;
  border-radius: var(--radius-full);
  background: var(--color-surface-2);
  border: 1px dashed var(--color-border-strong);
  color: var(--color-text-3);
  font-size: var(--font-xs);
  line-height: 1.6;
  text-align: center;
  overflow-wrap: anywhere;
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
  overflow-wrap: break-word;
  word-break: break-word;
}

.msg__bubble--media {
  padding: 6px;
  background: transparent;
  border-color: transparent;
}

.msg__text {
  white-space: pre-wrap;
}

.msg__attachments {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.msg__text + .msg__attachments {
  margin-top: 6px;
}

.msg--mine .msg__bubble {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-primary-contrast);
}

.msg--mine .msg__bubble--media {
  background: transparent;
  border-color: transparent;
}
</style>
