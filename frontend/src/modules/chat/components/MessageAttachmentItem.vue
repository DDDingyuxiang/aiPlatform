<script setup lang="ts">
/**
 * 单条消息附件。
 *
 * 附件下载接口需要 Bearer 令牌，因此这里先取回 Blob 再生成对象 URL：
 * 图片在消息内预览，其他类型点击后触发浏览器下载。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/shared/components/Icon.vue'
import { formatFileSize } from '@/shared/utils/format'
import { chatApi } from '../api'
import type { MessageAttachment } from '../types'

const props = defineProps<{
  conversationId: string
  attachment: MessageAttachment
}>()

const { t } = useI18n()
const blob = ref<Blob | null>(null)
const objectUrl = ref('')
const loading = ref(false)
const failed = ref(false)
const downloading = ref(false)

const isImage = computed(() => props.attachment.mimeType.startsWith('image/'))
const sizeLabel = computed(() => formatFileSize(props.attachment.sizeBytes))

async function fetchBlob(): Promise<Blob | null> {
  if (blob.value) return blob.value
  loading.value = true
  failed.value = false
  try {
    const result = await chatApi.downloadAttachment(
      props.conversationId,
      props.attachment.id,
    )
    blob.value = result
    return result
  } catch {
    failed.value = true
    return null
  } finally {
    loading.value = false
  }
}

/** 图片在挂载时自动取回并预览 */
onMounted(() => {
  if (!isImage.value) return
  void fetchBlob().then((result) => {
    if (result) objectUrl.value = URL.createObjectURL(result)
  })
})

onBeforeUnmount(() => {
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
})

async function download(): Promise<void> {
  if (downloading.value) return
  downloading.value = true
  try {
    const result = await fetchBlob()
    if (!result) return
    const url = URL.createObjectURL(result)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = props.attachment.fileName
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  } finally {
    downloading.value = false
  }
}
</script>

<template>
  <button
    v-if="isImage"
    type="button"
    class="attachment-image"
    :title="t('chat.attachment.download')"
    :aria-label="`${t('chat.attachment.download')} ${attachment.fileName}`"
    @click="download"
  >
    <img v-if="objectUrl" :src="objectUrl" :alt="attachment.fileName" />
    <span v-else class="attachment-image__state">
      {{ failed ? t('chat.attachment.failed') : t('chat.attachment.loading') }}
    </span>
  </button>

  <button
    v-else
    type="button"
    class="attachment-file"
    :disabled="downloading"
    @click="download"
  >
    <span class="attachment-file__icon"><Icon name="file" :size="16" /></span>
    <span class="attachment-file__body">
      <span class="attachment-file__name u-truncate">{{ attachment.fileName }}</span>
      <span class="attachment-file__meta">
        {{ failed ? t('chat.attachment.failed') : sizeLabel }}
      </span>
    </span>
    <Icon name="download" :size="15" class="attachment-file__action" />
  </button>
</template>

<style scoped>
.attachment-image {
  display: block;
  max-width: 260px;
  overflow: hidden;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-surface-2);
}

.attachment-image img {
  display: block;
  max-width: 100%;
  max-height: 260px;
  object-fit: contain;
}

.attachment-image__state {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 160px;
  min-height: 80px;
  padding: var(--space-3);
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

.attachment-file {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 200px;
  max-width: 320px;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-surface-2);
  text-align: left;
}

.attachment-file:disabled {
  opacity: 0.7;
}

.attachment-file__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-sm);
  background: var(--color-primary-soft);
  color: var(--color-primary-text);
  flex-shrink: 0;
}

.attachment-file__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.attachment-file__name {
  font-size: var(--font-sm);
  color: var(--color-text-1);
}

.attachment-file__meta {
  font-size: var(--font-xs);
  color: var(--color-text-3);
}

.attachment-file__action {
  color: var(--color-text-3);
  flex-shrink: 0;
}
</style>
