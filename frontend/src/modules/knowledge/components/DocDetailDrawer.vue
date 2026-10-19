<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/shared/components/Icon.vue'
import BaseAvatar from '@/shared/components/base/BaseAvatar.vue'
import BaseButton from '@/shared/components/base/BaseButton.vue'
import BaseDrawer from '@/shared/components/base/BaseDrawer.vue'
import BaseTag from '@/shared/components/base/BaseTag.vue'
import FileTypeChip from './FileTypeChip.vue'
import { useAuthStore } from '@/core/auth/store'
import { toast } from '@/shared/composables/useToast'
import { formatDateTime, formatFileSize } from '@/shared/utils/format'
import { knowledgeApi } from '../api'
import { useKnowledgeStore } from '../store'
import {
  ACCEPTED_EXTENSIONS,
  EXTENSION_TYPE_MAP,
  MAX_UPLOAD_BYTES,
  type KnowledgeDoc,
  type KnowledgeDocumentVersion,
} from '../types'

const props = defineProps<{ doc: KnowledgeDoc | null }>()
const emit = defineEmits<{ close: [] }>()

const { t, locale } = useI18n()
const auth = useAuthStore()
const knowledge = useKnowledgeStore()

const downloading = ref(false)
const uploadingVersion = ref(false)
const activatingVersion = ref<number | null>(null)
const reindexingVersion = ref<number | null>(null)
const deleting = ref(false)
const confirmDelete = ref(false)
const versionInputRef = ref<HTMLInputElement | null>(null)

const versions = computed<KnowledgeDocumentVersion[]>(() =>
  props.doc ? (knowledge.versionsById[props.doc.id] ?? []) : [],
)
const loadingVersions = computed(
  () => !!props.doc && knowledge.versionsLoading === props.doc.id,
)
const isOwner = computed(
  () => !!props.doc && props.doc.owner.id === auth.user?.id,
)

watch(
  () => props.doc?.id,
  async (id) => {
    confirmDelete.value = false
    if (!id) return
    try {
      await knowledge.loadVersions(id)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('intel.knowledge.versions.loadFailed'),
      )
    }
  },
  { immediate: true },
)

async function onDownload(versionNo?: number): Promise<void> {
  if (!props.doc || downloading.value) return
  downloading.value = true
  try {
    const blob = await knowledgeApi.download(props.doc.id, versionNo)
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

function pickVersionFile(): void {
  versionInputRef.value?.click()
}

async function onVersionFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !props.doc) return
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!EXTENSION_TYPE_MAP[extension]) {
    toast.error(t('intel.knowledge.uploadForm.invalidType'))
    return
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    toast.error(t('intel.knowledge.uploadForm.tooLarge'))
    return
  }
  uploadingVersion.value = true
  try {
    await knowledge.uploadVersion(props.doc.id, file)
    await knowledge.loadVersions(props.doc.id, true)
    toast.success(t('intel.knowledge.versions.uploaded'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('common.empty'))
  } finally {
    uploadingVersion.value = false
  }
}

async function onActivate(version: KnowledgeDocumentVersion): Promise<void> {
  if (!props.doc || activatingVersion.value !== null) return
  activatingVersion.value = version.versionNo
  try {
    await knowledge.activateVersion(props.doc.id, version.versionNo)
    await knowledge.loadVersions(props.doc.id, true)
    toast.success(
      t('intel.knowledge.versions.activated', { version: version.versionNo }),
    )
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('common.empty'))
  } finally {
    activatingVersion.value = null
  }
}

async function onReindex(version: KnowledgeDocumentVersion): Promise<void> {
  if (!props.doc || reindexingVersion.value !== null) return
  reindexingVersion.value = version.versionNo
  try {
    await knowledge.reindexVersion(props.doc.id, version.versionNo)
    await knowledge.loadVersions(props.doc.id, true)
    toast.success(
      t('intel.knowledge.versions.reindexed', { version: version.versionNo }),
    )
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('common.empty'))
  } finally {
    reindexingVersion.value = null
  }
}

async function onDelete(): Promise<void> {
  if (!props.doc || deleting.value) return
  if (!confirmDelete.value) {
    confirmDelete.value = true
    return
  }
  deleting.value = true
  try {
    await knowledge.removeDocument(props.doc.id)
    toast.success(t('intel.knowledge.versions.deleted'))
    emit('close')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('common.empty'))
  } finally {
    deleting.value = false
  }
}

function versionTone(
  version: KnowledgeDocumentVersion,
): 'primary' | 'neutral' | 'danger' {
  if (version.isCurrent) return 'primary'
  return version.status === 'failed' ? 'danger' : 'neutral'
}

function progressPercent(version: KnowledgeDocumentVersion): number {
  return Math.min(100, Math.max(0, version.jobProgress ?? 0))
}

function stageLabel(version: KnowledgeDocumentVersion): string {
  const stage = version.jobStage ?? 'queued'
  return t(`intel.knowledge.versions.stage.${stage}`)
}
</script>

<template>
  <BaseDrawer :open="!!doc" :title="doc?.title" :width="620" @close="emit('close')">
    <div v-if="doc" class="doc-detail">
      <div class="doc-detail__head">
        <FileTypeChip :type="doc.fileType" />
        <div class="doc-detail__head-body">
          <BaseTag tone="primary">{{ t(`intel.knowledge.categories.${doc.category}`) }}</BaseTag>
          <BaseTag v-if="doc.currentVersionNo" tone="neutral">
            v{{ doc.currentVersionNo }}
          </BaseTag>
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

      <section class="doc-detail__versions">
        <div class="doc-detail__versions-head">
          <span class="doc-detail__section-title">
            <Icon name="refresh" :size="15" />
            {{ t('intel.knowledge.versions.title') }}
          </span>
          <BaseButton
            variant="ghost"
            size="sm"
            :loading="uploadingVersion"
            @click="pickVersionFile"
          >
            <template #icon><Icon name="upload" :size="14" /></template>
            {{ t('intel.knowledge.versions.upload') }}
          </BaseButton>
          <input
            ref="versionInputRef"
            class="u-sr-only"
            type="file"
            :accept="ACCEPTED_EXTENSIONS"
            @change="onVersionFileChange"
          />
        </div>

        <p v-if="loadingVersions" class="doc-detail__versions-empty">
          {{ t('intel.knowledge.versions.loading') }}
        </p>
        <p
          v-else-if="versions.length === 0"
          class="doc-detail__versions-empty"
        >
          {{ t('intel.knowledge.versions.empty') }}
        </p>
        <template v-else>
          <div
            v-for="version in versions"
            :key="version.versionNo"
            class="doc-detail__version"
          >
          <div class="doc-detail__version-main">
            <span class="doc-detail__version-no">v{{ version.versionNo }}</span>
            <BaseTag :tone="versionTone(version)" size="sm">
              {{
                version.isCurrent
                  ? t('intel.knowledge.versions.current')
                  : t(`intel.knowledge.status.${version.status}`)
              }}
            </BaseTag>
            <span class="doc-detail__version-file u-truncate">
              {{ version.fileName }}
            </span>
            <span class="doc-detail__version-meta">
              {{ formatFileSize(version.sizeBytes) }} ·
              {{ formatDateTime(version.createdAt, locale) }}
            </span>
          </div>
          <div
            v-if="version.status === 'pending' || version.status === 'processing'"
            class="doc-detail__version-progress"
          >
            <div class="doc-detail__progress-line">
              <span>{{ stageLabel(version) }}</span>
              <span>
                {{
                  t('intel.knowledge.versions.progress', {
                    progress: progressPercent(version),
                  })
                }}
              </span>
            </div>
            <div
              class="doc-detail__progress-track"
              role="progressbar"
              :aria-valuenow="progressPercent(version)"
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <span
                class="doc-detail__progress-fill"
                :style="{ width: `${progressPercent(version)}%` }"
              />
            </div>
          </div>
          <p
            v-if="version.status === 'failed' && version.errorMessage"
            class="doc-detail__version-error"
          >
            {{
              t('intel.knowledge.versions.failedReason', {
                message: version.errorMessage,
              })
            }}
          </p>
          <div class="doc-detail__version-actions">
            <BaseButton
              variant="ghost"
              size="sm"
              @click="onDownload(version.versionNo)"
            >
              {{ t('intel.knowledge.versions.download') }}
            </BaseButton>
            <BaseButton
              v-if="isOwner && version.status === 'ready' && !version.isCurrent"
              variant="secondary"
              size="sm"
              :loading="activatingVersion === version.versionNo"
              @click="onActivate(version)"
            >
              {{ t('intel.knowledge.versions.activate') }}
            </BaseButton>
            <BaseButton
              v-if="isOwner && version.status === 'failed'"
              variant="secondary"
              size="sm"
              :loading="reindexingVersion === version.versionNo"
              @click="onReindex(version)"
            >
              {{ t('intel.knowledge.versions.retry') }}
            </BaseButton>
          </div>
        </div>
        </template>
      </section>

      <section v-if="isOwner" class="doc-detail__danger">
        <BaseButton variant="danger" size="sm" :loading="deleting" @click="onDelete">
          <template #icon><Icon name="trash" :size="14" /></template>
          {{
            confirmDelete
              ? t('intel.knowledge.versions.confirmDelete')
              : t('intel.knowledge.versions.delete')
          }}
        </BaseButton>
      </section>
    </div>

    <template #footer>
      <BaseButton variant="primary" :loading="downloading" @click="onDownload()">
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

.doc-detail__versions {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.doc-detail__versions-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.doc-detail__section-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-sm);
  font-weight: var(--weight-semibold);
  color: var(--color-text-1);
}

.doc-detail__versions-empty {
  font-size: var(--font-sm);
  color: var(--color-text-3);
}

.doc-detail__version {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.doc-detail__version-main {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.doc-detail__version-no {
  font-size: var(--font-sm);
  font-weight: var(--weight-semibold);
  color: var(--color-text-1);
}

.doc-detail__version-file {
  min-width: 0;
  font-size: var(--font-sm);
  color: var(--color-text-2);
}

.doc-detail__version-meta {
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

.doc-detail__version-progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.doc-detail__progress-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  font-size: var(--font-xs);
  color: var(--color-text-2);
}

.doc-detail__progress-track {
  height: 4px;
  overflow: hidden;
  background: var(--color-surface-2);
  border-radius: var(--radius-full);
}

.doc-detail__progress-fill {
  display: block;
  height: 100%;
  background: var(--color-primary);
  border-radius: var(--radius-full);
  transition: width var(--duration-fast) var(--ease-standard);
}

.doc-detail__version-error {
  font-size: var(--font-xs);
  color: var(--color-danger-text);
}

.doc-detail__version-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.doc-detail__danger {
  padding-top: var(--space-3);
  border-top: 1px dashed var(--color-border);
}
</style>
