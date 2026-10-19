<script setup lang="ts">
/** 知识库上传冲突：同名候选与重复内容 */
import { useI18n } from 'vue-i18n'
import BaseButton from '@/shared/components/base/BaseButton.vue'
import BaseModal from '@/shared/components/base/BaseModal.vue'
import BaseTag from '@/shared/components/base/BaseTag.vue'
import type { KnowledgeUploadConflictDetails } from '../types'

defineProps<{
  open: boolean
  conflict: KnowledgeUploadConflictDetails | null
}>()

const emit = defineEmits<{
  close: []
  asVersion: [documentId: string]
  asNew: []
  openDoc: [documentId: string]
}>()

const { t } = useI18n()
</script>

<template>
  <BaseModal
    :open="open"
    :title="t('intel.knowledge.conflict.title')"
    size="md"
    :close-on-overlay="false"
    @close="emit('close')"
  >
    <div v-if="conflict?.reason === 'same_name'" class="conflict">
      <p class="conflict__desc">{{ t('intel.knowledge.conflict.sameName') }}</p>
      <div
        v-for="candidate in conflict.candidates"
        :key="candidate.documentId"
        class="conflict__candidate"
      >
        <div class="conflict__candidate-body">
          <span class="conflict__candidate-title">{{ candidate.title }}</span>
          <span class="conflict__candidate-file u-truncate">
            {{ candidate.fileName }}
          </span>
        </div>
        <BaseTag
          v-if="candidate.currentVersionNo"
          tone="neutral"
          size="sm"
        >
          v{{ candidate.currentVersionNo }}
        </BaseTag>
        <BaseButton
          variant="primary"
          size="sm"
          @click="emit('asVersion', candidate.documentId)"
        >
          {{ t('intel.knowledge.conflict.asVersion') }}
        </BaseButton>
      </div>
    </div>

    <div v-else-if="conflict?.reason === 'duplicate_content'" class="conflict">
      <p class="conflict__desc">
        {{
          t('intel.knowledge.conflict.duplicate', {
            title: conflict.existing.title,
            version: conflict.existing.versionNo,
          })
        }}
      </p>
    </div>

    <template #footer>
      <BaseButton @click="emit('close')">{{ t('common.cancel') }}</BaseButton>
      <BaseButton
        v-if="conflict?.reason === 'same_name'"
        variant="secondary"
        @click="emit('asNew')"
      >
        {{ t('intel.knowledge.conflict.asNew') }}
      </BaseButton>
      <BaseButton
        v-else-if="conflict?.reason === 'duplicate_content'"
        variant="primary"
        @click="emit('openDoc', conflict.existing.documentId)"
      >
        {{ t('intel.knowledge.conflict.viewExisting') }}
      </BaseButton>
    </template>
  </BaseModal>
</template>

<style scoped>
.conflict {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.conflict__desc {
  font-size: var(--font-sm);
  line-height: 1.7;
  color: var(--color-text-2);
}

.conflict__candidate {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-2);
}

.conflict__candidate-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.conflict__candidate-title {
  font-size: var(--font-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text-1);
}

.conflict__candidate-file {
  font-size: var(--font-xs);
  color: var(--color-text-3);
}
</style>
