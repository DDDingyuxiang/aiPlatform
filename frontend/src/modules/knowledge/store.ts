/** 知识库状态（Pinia）：文档列表、上传与语义检索 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { knowledgeApi } from './api'
import type {
  KnowledgeDoc,
  KnowledgeSearchHit,
  UploadKnowledgeInput,
} from './types'

export const useKnowledgeStore = defineStore('knowledge', () => {
  const docs = ref<KnowledgeDoc[]>([])
  const loaded = ref(false)
  const loading = ref(false)
  const searchHits = ref<KnowledgeSearchHit[]>([])
  const searching = ref(false)
  const searchError = ref('')
  let searchSequence = 0

  /** 面板预览：最近更新的 3 份材料 */
  const recentDocs = computed(() => docs.value.slice(0, 3))

  async function loadAll(force = false): Promise<void> {
    if ((loaded.value && !force) || loading.value) return
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

  async function upload(input: UploadKnowledgeInput): Promise<KnowledgeDoc> {
    const doc = await knowledgeApi.upload(input)
    docs.value.unshift(doc)
    return doc
  }

  function byId(id: string): KnowledgeDoc | undefined {
    return docs.value.find((doc) => doc.id === id)
  }

  /** 语义检索：只保留最后一次请求的结果，避免输入时旧响应覆盖新结果 */
  async function search(query: string): Promise<void> {
    const trimmed = query.trim()
    if (!trimmed) {
      clearSearch()
      return
    }

    const sequence = ++searchSequence
    searching.value = true
    searchError.value = ''
    try {
      const result = await knowledgeApi.search(trimmed)
      if (sequence !== searchSequence) return
      searchHits.value = result.hits
    } catch (error) {
      if (sequence !== searchSequence) return
      searchHits.value = []
      searchError.value = error instanceof Error ? error.message : '语义检索失败'
      console.error('[knowledge] 语义检索失败', error)
    } finally {
      if (sequence === searchSequence) searching.value = false
    }
  }

  function clearSearch(): void {
    searchSequence += 1
    searchHits.value = []
    searching.value = false
    searchError.value = ''
  }

  return {
    docs,
    loaded,
    loading,
    recentDocs,
    searchHits,
    searching,
    searchError,
    loadAll,
    upload,
    byId,
    search,
    clearSearch,
  }
})
