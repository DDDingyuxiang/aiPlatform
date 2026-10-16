<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Icon from '@/shared/components/Icon.vue'
import BaseAvatar from '@/shared/components/base/BaseAvatar.vue'
import BaseButton from '@/shared/components/base/BaseButton.vue'
import BaseInput from '@/shared/components/base/BaseInput.vue'
import BaseTag from '@/shared/components/base/BaseTag.vue'
import DocDetailDrawer from './components/DocDetailDrawer.vue'
import FileTypeChip from './components/FileTypeChip.vue'
import UploadModal from './components/UploadModal.vue'
import { useKnowledgeStore } from './store'
import type { DocCategory, KnowledgeDoc } from './types'
import { formatFileSize, formatRelativeTime } from '@/shared/utils/format'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const knowledge = useKnowledgeStore()

type CategoryFilter = DocCategory | 'all'

const keyword = ref('')
const activeCategory = ref<CategoryFilter>('all')
const uploadOpen = ref(false)

onMounted(() => {
  void knowledge.loadAll()
})

const CATEGORIES: CategoryFilter[] = ['all', 'policy', 'product', 'tech', 'market', 'training']

const filteredDocs = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  return knowledge.docs.filter((doc) => {
    if (activeCategory.value !== 'all' && doc.category !== activeCategory.value) return false
    if (!query) return true
    return (
      doc.title.toLowerCase().includes(query) ||
      doc.tags.some((tag) => tag.toLowerCase().includes(query))
    )
  })
})

/** 详情抽屉由路由 query.doc 驱动（面板等入口可深链） */
const activeDoc = computed<KnowledgeDoc | null>(() => {
  const id = route.query.doc
  return typeof id === 'string' && id ? (knowledge.byId(id) ?? null) : null
})

function openDoc(id: string): void {
  void router.push({ path: '/knowledge', query: { doc: id } })
}

function closeDoc(): void {
  void router.replace({ path: '/knowledge' })
}

function relative(iso: string): string {
  return formatRelativeTime(iso, locale.value, t('common.justNow'))
}
</script>

<template>
  <div class="knowledge">
    <header class="knowledge__hero">
      <div>
        <h2 class="knowledge__title">{{ t('nav.knowledge') }}</h2>
        <p class="knowledge__subtitle">{{ t('intel.knowledge.subtitle') }}</p>
      </div>
      <BaseButton variant="primary" @click="uploadOpen = true">
        <template #icon><Icon name="upload" :size="16" /></template>
        {{ t('intel.knowledge.upload') }}
      </BaseButton>
    </header>

    <div class="knowledge__toolbar">
      <div class="knowledge__search">
        <BaseInput
          v-model="keyword"
          :placeholder="t('intel.knowledge.searchPlaceholder')"
          prefix-icon="search"
        />
      </div>
      <div class="knowledge__chips">
        <button
          v-for="category in CATEGORIES"
          :key="category"
          class="knowledge__chip"
          :class="{ 'knowledge__chip--active': activeCategory === category }"
          @click="activeCategory = category"
        >
          {{ t(`intel.knowledge.categories.${category}`) }}
        </button>
      </div>
    </div>

    <p class="knowledge__count">
      {{ t('intel.knowledge.resultCount', { count: filteredDocs.length }) }}
    </p>

    <div class="doc-table">
      <button v-for="doc in filteredDocs" :key="doc.id" class="doc-row" @click="openDoc(doc.id)">
        <FileTypeChip :type="doc.fileType" />
        <span class="doc-row__main">
          <span class="doc-row__title u-truncate">{{ doc.title }}</span>
          <span v-if="doc.tags.length" class="doc-row__tags">
            <BaseTag v-for="tag in doc.tags.slice(0, 3)" :key="tag" tone="neutral" size="sm">
              {{ tag }}
            </BaseTag>
          </span>
        </span>
        <span class="doc-row__cell">
          <BaseAvatar :name="doc.owner.name" :size="24" />
          <span class="doc-row__owner">
            <span>{{ doc.owner.name }}</span>
            <span class="doc-row__dept">{{ doc.department }}</span>
          </span>
        </span>
        <span class="doc-row__cell doc-row__cell--muted">{{ relative(doc.updatedAt) }}</span>
        <span class="doc-row__cell doc-row__cell--muted u-tabular">
          {{ formatFileSize(doc.sizeBytes) }}
        </span>
      </button>
      <p v-if="filteredDocs.length === 0" class="doc-table__empty">
        {{ t('intel.knowledge.empty') }}
      </p>
    </div>

    <DocDetailDrawer :doc="activeDoc" @close="closeDoc" />
    <UploadModal :open="uploadOpen" @close="uploadOpen = false" />
  </div>
</template>

<style scoped>
.knowledge {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.knowledge__hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.knowledge__title {
  font-size: var(--font-2xl);
  font-weight: var(--weight-semibold);
  color: var(--color-text-1);
}

.knowledge__subtitle {
  margin-top: 6px;
  font-size: var(--font-md);
  color: var(--color-text-2);
}

.knowledge__toolbar {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.knowledge__search {
  width: 380px;
  max-width: 100%;
}

.knowledge__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.knowledge__chip {
  padding: 5px 12px;
  border-radius: var(--radius-full);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  font-size: var(--font-sm);
  color: var(--color-text-2);
  transition:
    background-color var(--duration-fast) var(--ease-standard),
    color var(--duration-fast) var(--ease-standard),
    border-color var(--duration-fast) var(--ease-standard);
}

.knowledge__chip:hover {
  border-color: var(--color-border-strong);
  color: var(--color-text-1);
}

.knowledge__chip--active {
  background: var(--color-primary-soft);
  border-color: transparent;
  color: var(--color-primary-text);
  font-weight: var(--weight-medium);
}

.knowledge__count {
  font-size: var(--font-sm);
  color: var(--color-text-3);
}

/* ---- 文档列表 ---- */
.doc-table {
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xs);
  overflow: hidden;
}

.doc-row {
  display: grid;
  grid-template-columns: auto minmax(0, 2.4fr) 1.2fr 0.9fr 0.5fr;
  align-items: center;
  gap: var(--space-3);
  padding: 11px var(--space-4);
  text-align: left;
  border-bottom: 1px solid var(--color-border);
  transition: background-color var(--duration-fast) var(--ease-standard);
}

.doc-row:last-of-type {
  border-bottom: none;
}

.doc-row:hover {
  background: var(--color-surface-2);
}

.doc-row__main {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.doc-row__title {
  font-size: var(--font-md);
  font-weight: var(--weight-medium);
  color: var(--color-text-1);
}

.doc-row__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.doc-row__cell {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-sm);
  color: var(--color-text-2);
  min-width: 0;
}

.doc-row__cell--muted {
  color: var(--color-text-3);
  font-size: var(--font-xs);
}

.doc-row__owner {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.doc-row__dept {
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

.doc-table__empty {
  padding: var(--space-8);
  text-align: center;
  font-size: var(--font-sm);
  color: var(--color-text-3);
}

@media (max-width: 1023px) {
  .doc-row {
    grid-template-columns: auto 1fr;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-4);
  }

  .doc-row__cell {
    grid-column: 2;
    font-size: var(--font-xs);
  }
}
</style>
