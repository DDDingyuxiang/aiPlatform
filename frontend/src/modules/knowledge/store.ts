/** 知识库状态（Pinia）：文档列表、上传与语义检索 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { knowledgeApi } from './api'
import type {
  KnowledgeDoc,
  KnowledgeDocumentVersion,
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
  const versionsById = ref<Record<string, KnowledgeDocumentVersion[]>>({})
  const versionsLoading = ref<string | null>(null)
  const statusPollers = new Map<
    string,
    {
      timer: ReturnType<typeof setInterval>
      inFlight: boolean
      failures: number
      versionNo?: number
    }
  >()
  let searchSequence = 0

  /** 面板预览：最近更新的 3 份材料 */
  const recentDocs = computed(() => docs.value.slice(0, 3))

  function stopStatusPolling(documentId: string): void {
    const poller = statusPollers.get(documentId)
    if (!poller) return
    clearInterval(poller.timer)
    statusPollers.delete(documentId)
  }

  async function tickStatusPoller(documentId: string): Promise<void> {
    const poller = statusPollers.get(documentId)
    if (!poller || poller.inFlight) return
    poller.inFlight = true
    try {
      const status = await knowledgeApi.status(documentId, poller.versionNo)
      replaceDoc(status.document)
      const version = status.version
      if (version) {
        const list = versionsById.value[documentId]
        if (list) {
          const index = list.findIndex(
            (item) => item.versionNo === version.versionNo,
          )
          if (index >= 0) list.splice(index, 1, version)
          else list.unshift(version)
        }
      }
      poller.failures = 0
      if (
        !version ||
        version.status === 'ready' ||
        version.status === 'failed'
      ) {
        stopStatusPolling(documentId)
      }
    } catch (error) {
      poller.failures += 1
      if (poller.failures >= 5) stopStatusPolling(documentId)
      console.error('[knowledge] 状态轮询失败', error)
    } finally {
      poller.inFlight = false
    }
  }

  function startStatusPolling(documentId: string, versionNo?: number): void {
    if (statusPollers.has(documentId)) return
    const timer = setInterval(() => {
      void tickStatusPoller(documentId)
    }, 2_000)
    statusPollers.set(documentId, { timer, inFlight: false, failures: 0, versionNo })
    void tickStatusPoller(documentId)
  }

  async function loadAll(force = false): Promise<void> {
    if ((loaded.value && !force) || loading.value) return
    loading.value = true
    try {
      docs.value = await knowledgeApi.documents()
      loaded.value = true
      for (const doc of docs.value) {
        if (doc.status === 'pending' || doc.status === 'processing') {
          startStatusPolling(doc.id)
        }
      }
    } catch (error) {
      console.error('[knowledge] 文档加载失败', error)
    } finally {
      loading.value = false
    }
  }

  async function upload(input: UploadKnowledgeInput): Promise<KnowledgeDoc> {
    const doc = await knowledgeApi.upload(input)
    docs.value.unshift(doc)
    if (doc.status === 'pending' || doc.status === 'processing') {
      startStatusPolling(doc.id)
    }
    return doc
  }

  function replaceDoc(doc: KnowledgeDoc): void {
    const index = docs.value.findIndex((item) => item.id === doc.id)
    if (index >= 0) docs.value.splice(index, 1, doc)
    else docs.value.unshift(doc)
  }

  async function uploadVersion(
    documentId: string,
    file: File,
  ): Promise<KnowledgeDoc> {
    const doc = await knowledgeApi.uploadVersion(documentId, file)
    replaceDoc(doc)
    delete versionsById.value[documentId]
    if (doc.status === 'pending' || doc.status === 'processing') {
      startStatusPolling(documentId)
    }
    return doc
  }

  async function loadVersions(
    documentId: string,
    force = false,
  ): Promise<KnowledgeDocumentVersion[]> {
    if (!force && versionsById.value[documentId]) {
      return versionsById.value[documentId]!
    }
    versionsLoading.value = documentId
    try {
      const versions = await knowledgeApi.versions(documentId)
      versionsById.value[documentId] = versions
      const pending = versions.find(
        (version) =>
          version.status === 'pending' || version.status === 'processing',
      )
      if (pending) startStatusPolling(documentId, pending.versionNo)
      return versions
    } finally {
      if (versionsLoading.value === documentId) versionsLoading.value = null
    }
  }

  async function activateVersion(
    documentId: string,
    versionNo: number,
  ): Promise<KnowledgeDoc> {
    const doc = await knowledgeApi.activateVersion(documentId, versionNo)
    replaceDoc(doc)
    delete versionsById.value[documentId]
    return doc
  }

  async function reindexVersion(
    documentId: string,
    versionNo: number,
  ): Promise<void> {
    await knowledgeApi.reindexVersion(documentId, versionNo)
    delete versionsById.value[documentId]
    startStatusPolling(documentId, versionNo)
    // 重新索引可能激活更高版本，刷新文档列表以同步 currentVersionNo
    const latest = await knowledgeApi.documents()
    docs.value = latest
  }

  async function removeDocument(documentId: string): Promise<void> {
    await knowledgeApi.deleteDocument(documentId)
    stopStatusPolling(documentId)
    docs.value = docs.value.filter((doc) => doc.id !== documentId)
    delete versionsById.value[documentId]
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
    versionsById,
    versionsLoading,
    loadAll,
    upload,
    uploadVersion,
    loadVersions,
    activateVersion,
    reindexVersion,
    removeDocument,
    byId,
    search,
    clearSearch,
  }
})
