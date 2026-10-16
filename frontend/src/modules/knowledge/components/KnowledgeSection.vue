<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Icon from '@/shared/components/Icon.vue'
import BaseButton from '@/shared/components/base/BaseButton.vue'
import FileTypeChip from './FileTypeChip.vue'
import UploadModal from './UploadModal.vue'
import { usePreferencesStore } from '@/core/preferences/store'
import { formatRelativeTime } from '@/shared/utils/format'
import { useKnowledgeStore } from '../store'

const { t, locale } = useI18n()
const router = useRouter()
const preferences = usePreferencesStore()
const knowledge = useKnowledgeStore()

const uploadOpen = ref(false)

onMounted(() => {
  void knowledge.loadAll()
})

function open(id: string): void {
  preferences.closeMobileNav()
  void router.push({ path: '/knowledge', query: { doc: id } })
}

function relative(iso: string): string {
  return formatRelativeTime(iso, locale.value, t('common.justNow'))
}
</script>

<template>
  <div class="doc-brief">
    <ul v-if="knowledge.recentDocs.length" class="doc-brief__list">
      <li v-for="doc in knowledge.recentDocs" :key="doc.id">
        <button class="doc-brief__item" @click="open(doc.id)">
          <FileTypeChip :type="doc.fileType" size="sm" />
          <span class="doc-brief__body">
            <span class="doc-brief__title u-truncate">{{ doc.title }}</span>
            <span class="doc-brief__meta">{{ doc.owner.name }} · {{ relative(doc.updatedAt) }}</span>
          </span>
        </button>
      </li>
    </ul>
    <p v-else class="doc-brief__empty">{{ t('intel.knowledge.empty') }}</p>

    <BaseButton size="sm" variant="subtle" block class="doc-brief__upload" @click="uploadOpen = true">
      <template #icon><Icon name="upload" :size="14" /></template>
      {{ t('intel.knowledge.upload') }}
    </BaseButton>
    <RouterLink to="/knowledge" class="doc-brief__all" @click="preferences.closeMobileNav()">
      {{ t('common.viewAll') }}
      <Icon name="chevron-right" :size="13" />
    </RouterLink>

    <UploadModal :open="uploadOpen" @close="uploadOpen = false" />
  </div>
</template>

<style scoped>
.doc-brief {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.doc-brief__list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.doc-brief__item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: 6px 8px;
  border-radius: var(--radius-md);
  text-align: left;
  transition: background-color var(--duration-fast) var(--ease-standard);
}

.doc-brief__item:hover {
  background: var(--color-surface-3);
}

.doc-brief__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.doc-brief__title {
  font-size: var(--font-sm);
  color: var(--color-text-1);
}

.doc-brief__meta {
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

.doc-brief__empty {
  padding: var(--space-3) 8px;
  font-size: var(--font-xs);
  color: var(--color-text-3);
  text-align: center;
}

.doc-brief__upload {
  margin-top: var(--space-2);
}

.doc-brief__all {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  align-self: flex-end;
  margin-top: 6px;
  padding: 3px 4px;
  font-size: var(--font-xs);
  color: var(--color-primary-text);
}

.doc-brief__all:hover {
  text-decoration: underline;
}
</style>
