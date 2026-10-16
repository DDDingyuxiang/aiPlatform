<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/shared/components/Icon.vue'
import BaseButton from '@/shared/components/base/BaseButton.vue'
import BaseInput from '@/shared/components/base/BaseInput.vue'
import BaseModal from '@/shared/components/base/BaseModal.vue'
import BaseSelect from '@/shared/components/base/BaseSelect.vue'
import { toast } from '@/shared/composables/useToast'
import { formatFileSize } from '@/shared/utils/format'
import { useKnowledgeStore } from '../store'
import {
  EXTENSION_TYPE_MAP,
  MAX_UPLOAD_BYTES,
  type DocCategory,
  type DocFileType,
} from '../types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; uploaded: [] }>()

const { t } = useI18n()
const knowledge = useKnowledgeStore()

const fileInputRef = ref<HTMLInputElement | null>(null)
const selected = ref<{ name: string; size: number; type: DocFileType } | null>(null)
const form = reactive({ title: '', category: 'policy' as DocCategory, tags: '' })
const fileError = ref('')
const titleError = ref('')
const submitting = ref(false)

const CATEGORIES: DocCategory[] = ['policy', 'product', 'tech', 'market', 'training']
const categoryOptions = computed(() =>
  CATEGORIES.map((category) => ({ value: category, label: t(`intel.knowledge.categories.${category}`) })),
)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    selected.value = null
    fileError.value = ''
    titleError.value = ''
    Object.assign(form, { title: '', category: 'policy' as DocCategory, tags: '' })
  },
)

function pickFile(): void {
  fileInputRef.value?.click()
}

/** 仅读取文件名与大小用于演示；真实环境由后端签名直传对象存储 */
function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  const fileType = EXTENSION_TYPE_MAP[extension]
  if (!fileType) {
    fileError.value = t('intel.knowledge.uploadForm.invalidType')
    return
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    fileError.value = t('intel.knowledge.uploadForm.tooLarge')
    return
  }
  fileError.value = ''
  selected.value = { name: file.name, size: file.size, type: fileType }
  if (!form.title.trim()) form.title = file.name.replace(/\.[^.]+$/, '')
}

function removeFile(): void {
  selected.value = null
}

async function submit(): Promise<void> {
  titleError.value = form.title.trim() ? '' : t('common.validation.required')
  if (!selected.value) fileError.value = t('common.validation.required')
  if (titleError.value || fileError.value || submitting.value) return
  const file = selected.value
  if (!file) return
  submitting.value = true
  try {
    await knowledge.upload({
      title: form.title.trim(),
      category: form.category,
      tags: form.tags
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
      fileName: file.name,
      fileType: file.type,
      sizeBytes: file.size,
    })
    toast.success(t('intel.knowledge.uploaded'))
    emit('uploaded')
    emit('close')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('common.empty'))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <BaseModal
    :open="open"
    :title="t('intel.knowledge.uploadForm.title')"
    size="md"
    :close-on-overlay="false"
    @close="emit('close')"
  >
    <div class="upload">
      <button type="button" class="upload__drop" @click="pickFile">
        <Icon name="upload" :size="22" class="upload__drop-icon" />
        <span class="upload__drop-text">{{ t('intel.knowledge.uploadForm.drop') }}</span>
        <span class="upload__drop-hint">{{ t('intel.knowledge.uploadForm.hint') }}</span>
      </button>
      <input
        ref="fileInputRef"
        class="u-sr-only"
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp"
        @change="onFileChange"
      />

      <div v-if="selected" class="upload__file">
        <Icon name="file" :size="16" />
        <span class="upload__file-name u-truncate">{{ selected.name }}</span>
        <span class="upload__file-size">{{ formatFileSize(selected.size) }}</span>
        <button type="button" class="upload__file-remove" :aria-label="t('common.close')" @click="removeFile">
          <Icon name="close" :size="14" />
        </button>
      </div>
      <p v-if="fileError" class="upload__error">{{ fileError }}</p>

      <BaseInput
        v-model="form.title"
        :label="t('intel.knowledge.uploadForm.name')"
        :placeholder="t('intel.knowledge.uploadForm.namePlaceholder')"
        :error="titleError"
        required
      />
      <div class="upload__grid">
        <BaseSelect
          v-model="form.category"
          :label="t('intel.knowledge.uploadForm.category')"
          :options="categoryOptions"
        />
        <BaseInput
          v-model="form.tags"
          :label="t('intel.knowledge.uploadForm.tags')"
          :placeholder="t('intel.knowledge.uploadForm.tagsPlaceholder')"
        />
      </div>
    </div>

    <template #footer>
      <BaseButton @click="emit('close')">{{ t('common.cancel') }}</BaseButton>
      <BaseButton variant="primary" :loading="submitting" @click="submit">
        {{ t('intel.knowledge.uploadForm.submit') }}
      </BaseButton>
    </template>
  </BaseModal>
</template>

<style scoped>
.upload {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.upload__drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: var(--space-6) var(--space-5);
  background: var(--color-surface-2);
  border: 1.5px dashed var(--color-border-strong);
  border-radius: var(--radius-lg);
  text-align: center;
  transition:
    border-color var(--duration-fast) var(--ease-standard),
    background-color var(--duration-fast) var(--ease-standard);
}

.upload__drop:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}

.upload__drop-icon {
  color: var(--color-primary);
}

.upload__drop-text {
  font-size: var(--font-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text-1);
}

.upload__drop-hint {
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

.upload__file {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 8px 12px;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-2);
}

.upload__file-name {
  flex: 1;
  min-width: 0;
  font-size: var(--font-sm);
  color: var(--color-text-1);
}

.upload__file-size {
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

.upload__file-remove {
  display: inline-flex;
  padding: 2px;
  border-radius: var(--radius-xs);
  color: var(--color-text-3);
}

.upload__file-remove:hover {
  color: var(--color-danger-text);
}

.upload__error {
  font-size: var(--font-xs);
  color: var(--color-danger-text);
}

.upload__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}

@media (max-width: 640px) {
  .upload__grid {
    grid-template-columns: 1fr;
  }
}
</style>
