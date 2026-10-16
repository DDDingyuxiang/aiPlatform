<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/shared/components/Icon.vue'
import BaseAvatar from '@/shared/components/base/BaseAvatar.vue'
import BaseModal from '@/shared/components/base/BaseModal.vue'
import BaseTag from '@/shared/components/base/BaseTag.vue'
import { toast } from '@/shared/composables/useToast'
import { formatDateTime, formatFileSize } from '@/shared/utils/format'
import type { Announcement, AnnouncementScope } from '../types'

const props = defineProps<{ announcement: Announcement | null }>()
const emit = defineEmits<{ close: [] }>()

const { t, locale } = useI18n()

const SCOPE_TONE: Record<AnnouncementScope, 'primary' | 'info' | 'neutral'> = {
  company: 'primary',
  department: 'info',
  colleague: 'neutral',
}

const publishedAt = computed(() =>
  props.announcement ? formatDateTime(props.announcement.publishedAt, locale.value) : '',
)

function onAttachmentClick(): void {
  toast.info(t('common.comingSoon'))
}
</script>

<template>
  <BaseModal :open="!!announcement" size="lg" @close="emit('close')">
    <template #header>
      <h3 class="notice-detail__title">{{ announcement?.title }}</h3>
    </template>

    <div v-if="announcement" class="notice-detail">
      <div class="notice-detail__meta">
        <BaseAvatar :name="announcement.publisher.name" :size="28" />
        <div class="notice-detail__meta-body">
          <p class="notice-detail__publisher">
            {{ announcement.publisher.name }}
            <BaseTag v-if="announcement.scope === 'department' && announcement.department" tone="info" size="sm">
              {{ announcement.department }}
            </BaseTag>
          </p>
          <p class="notice-detail__time">
            {{ t('intel.announcements.publishedAt') }}：{{ publishedAt }}
          </p>
        </div>
        <div class="notice-detail__meta-tags">
          <BaseTag v-if="announcement.pinned" tone="warning">{{ t('intel.announcements.pinned') }}</BaseTag>
          <BaseTag :tone="SCOPE_TONE[announcement.scope]">
            {{ t(`intel.announcements.scope.${announcement.scope}`) }}
          </BaseTag>
        </div>
      </div>

      <div class="notice-detail__content">
        <p v-for="(paragraph, index) in announcement.paragraphs" :key="index" class="notice-detail__paragraph">
          {{ paragraph }}
        </p>
      </div>

      <section v-if="announcement.attachments.length" class="notice-detail__attachments">
        <p class="notice-detail__section-title">{{ t('intel.announcements.attachments') }}</p>
        <button
          v-for="attachment in announcement.attachments"
          :key="attachment.id"
          class="notice-detail__attachment"
          @click="onAttachmentClick"
        >
          <Icon name="paperclip" :size="15" />
          <span class="notice-detail__attachment-name u-truncate">{{ attachment.name }}</span>
          <span class="notice-detail__attachment-size">{{ formatFileSize(attachment.sizeBytes) }}</span>
          <Icon name="download" :size="15" class="notice-detail__attachment-download" />
        </button>
      </section>
    </div>
  </BaseModal>
</template>

<style scoped>
.notice-detail__title {
  font-size: var(--font-xl);
  font-weight: var(--weight-semibold);
  color: var(--color-text-1);
  line-height: 1.4;
}

.notice-detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.notice-detail__meta {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.notice-detail__meta-body {
  flex: 1;
  min-width: 0;
}

.notice-detail__publisher {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text-1);
}

.notice-detail__time {
  margin-top: 2px;
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

.notice-detail__meta-tags {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

.notice-detail__content {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.notice-detail__paragraph {
  font-size: var(--font-md);
  line-height: 1.8;
  color: var(--color-text-1);
}

.notice-detail__section-title {
  margin-bottom: var(--space-2);
  font-size: var(--font-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text-2);
}

.notice-detail__attachments {
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
}

.notice-detail__attachment {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-2);
  transition: background-color var(--duration-fast) var(--ease-standard);
}

.notice-detail__attachment:hover {
  background: var(--color-surface-2);
}

.notice-detail__attachment-name {
  flex: 1;
  min-width: 0;
  font-size: var(--font-sm);
  color: var(--color-text-1);
}

.notice-detail__attachment-size {
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

.notice-detail__attachment-download {
  color: var(--color-primary);
}
</style>
