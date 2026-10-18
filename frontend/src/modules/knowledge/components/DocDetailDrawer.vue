<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/shared/components/Icon.vue'
import BaseAvatar from '@/shared/components/base/BaseAvatar.vue'
import BaseButton from '@/shared/components/base/BaseButton.vue'
import BaseDrawer from '@/shared/components/base/BaseDrawer.vue'
import BaseTag from '@/shared/components/base/BaseTag.vue'
import FileTypeChip from './FileTypeChip.vue'
import { toast } from '@/shared/composables/useToast'
import { formatDateTime, formatFileSize } from '@/shared/utils/format'
import { knowledgeApi } from '../api'
import type { KnowledgeDoc } from '../types'

const props = defineProps<{ doc: KnowledgeDoc | null }>()
const emit = defineEmits<{ close: [] }>()

const { t, locale } = useI18n()
const downloading = ref(false)

async function onDownload(): Promise<void> {
  if (!props.doc || downloading.value) return
  downloading.value = true
  try {
    const blob = await knowledgeApi.download(props.doc.id)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = props.doc.fileName ?? props.doc.title
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('common.empty'))
  } finally {
    downloading.value = false
  }
}
</script>

<template>
  <BaseDrawer :open="!!doc" :title="doc?.title" :width="540" @close="emit('close')">
    <div v-if="doc" class="doc-detail">
      <div class="doc-detail__head">
        <FileTypeChip :type="doc.fileType" />
        <div class="doc-detail__head-body">
          <BaseTag tone="primary">{{ t(`intel.knowledge.categories.${doc.category}`) }}</BaseTag>
          <span class="doc-detail__size">{{ formatFileSize(doc.sizeBytes) }}</span>
        </div>
      </div>

      <dl class="doc-detail__meta">
        <div class="doc-detail__row">
          <dt>{{ t('intel.knowledge.col.owner') }}</dt>
          <dd class="doc-detail__person">
            <BaseAvatar :name="doc.owner.name" :size="22" />
            {{ doc.owner.name }}（{{ doc.department }}）
          </dd>
        </div>
        <div class="doc-detail__row">
          <dt>{{ t('intel.knowledge.col.updatedAt') }}</dt>
          <dd>{{ formatDateTime(doc.updatedAt, locale) }}</dd>
        </div>
      </dl>

      <section v-if="doc.tags.length" class="doc-detail__tags">
        <BaseTag v-for="tag in doc.tags" :key="tag" tone="neutral">{{ tag }}</BaseTag>
      </section>

      <section class="doc-detail__summary">
        <div class="doc-detail__summary-head">
          <span class="doc-detail__summary-title">
            <Icon name="sparkles" :size="15" />
            {{ t('intel.knowledge.detail.summary') }}
          </span>
          <BaseTag v-if="doc.summary" tone="ai">{{ t('common.ai.generated') }}</BaseTag>
        </div>
        <p class="doc-detail__summary-text">
          {{ doc.summary || t('intel.knowledge.detail.summaryEmpty') }}
        </p>
        <p v-if="doc.summary" class="doc-detail__disclaimer">{{ t('common.ai.disclaimer') }}</p>
      </section>
    </div>

    <template #footer>
      <BaseButton variant="primary" :loading="downloading" @click="onDownload">
        <template #icon><Icon name="download" :size="15" /></template>
        {{ t('intel.knowledge.detail.download') }}
      </BaseButton>
    </template>
  </BaseDrawer>
</template>

<style scoped>
.doc-detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.doc-detail__head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.doc-detail__head-body {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
}

.doc-detail__size {
  font-size: var(--font-sm);
  color: var(--color-text-3);
}

.doc-detail__meta {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.doc-detail__row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.doc-detail__row dt {
  width: 72px;
  flex-shrink: 0;
  font-size: var(--font-sm);
  color: var(--color-text-3);
}

.doc-detail__row dd {
  font-size: var(--font-md);
  color: var(--color-text-1);
}

.doc-detail__person {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.doc-detail__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.doc-detail__summary {
  padding: var(--space-4);
  background: var(--color-ai-soft);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.doc-detail__summary-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.doc-detail__summary-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-sm);
  font-weight: var(--weight-semibold);
  color: var(--color-ai-1);
}

.doc-detail__summary-text {
  font-size: var(--font-md);
  line-height: 1.75;
  color: var(--color-text-1);
}

.doc-detail__disclaimer {
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px dashed var(--color-border);
  font-size: var(--font-xs);
  color: var(--color-text-3);
}
</style>
