/** 知识库状态（Pinia）：文档列表与上传 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { knowledgeApi } from './api'
import type { KnowledgeDoc, UploadDocPayload } from './types'

export const useKnowledgeStore = defineStore('knowledge', () => {
  const docs = ref<KnowledgeDoc[]>([])
  const loaded = ref(false)
  const loading = ref(false)

  /** 面板预览：最近更新的 3 份材料 */
  const recentDocs = computed(() => docs.value.slice(0, 3))

  async function loadAll(): Promise<void> {
    if (loaded.value || loading.value) return
    loading.value = true
    try {
      docs.value = await knowledgeApi.documents()
      loaded.value = true
    } catch (error) {
      console.error('[knowledge] 文档加载失败', error)
    } finally {
      loading.value = false
    }
  }

  async function upload(payload: UploadDocPayload): Promise<KnowledgeDoc> {
    const doc = await knowledgeApi.upload(payload)
    docs.value.unshift(doc)
    return doc
  }

  function byId(id: string): KnowledgeDoc | undefined {
    return docs.value.find((doc) => doc.id === id)
  }

  return { docs, loaded, loading, recentDocs, loadAll, upload, byId }
})
