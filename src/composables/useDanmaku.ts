import { ref } from 'vue'
import { getComments } from '../lib/api'
import { parseComments } from '../lib/danmaku'
import { cacheComments, getCachedComments } from '../lib/storage'
import type { DanmakuComment } from '../types'

const COMMENTS_CACHE_TTL = 21600000

interface DanmakuDeps {
  t: (key: string, params?: Record<string, string | number>) => string
  toast: (message: string) => void
  onError: (message: string) => void
}

export function useDanmaku(deps: DanmakuDeps) {
  const comments = ref<DanmakuComment[]>([])
  const commentsLoading = ref(false)
  let commentsRequest = 0

  async function loadComments(episodeId: number) {
    const requestId = ++commentsRequest
    commentsLoading.value = true
    try {
      const cached = await getCachedComments(episodeId).catch(() => undefined)
      if (requestId !== commentsRequest) return
      if (cached && Date.now() - cached.cachedAt < COMMENTS_CACHE_TTL) {
        comments.value = cached.comments
        deps.toast(deps.t('cachedComments', { count: comments.value.length }))
        return
      }
      const result = await getComments(episodeId)
      if (requestId !== commentsRequest) return
      comments.value = parseComments(result.comments || [])
      try {
        await cacheComments(episodeId, comments.value)
      } catch {
        // 缓存写入失败不影响已成功加载的弹幕
      }
      if (requestId === commentsRequest) deps.toast(deps.t('loadedComments', { count: comments.value.length }))
    } catch (exception) {
      if (requestId !== commentsRequest) return
      deps.onError(exception instanceof Error ? exception.message : deps.t('danmakuLoadingFailed'))
    } finally {
      if (requestId === commentsRequest) commentsLoading.value = false
    }
  }

  function resetComments(initial: DanmakuComment[] = []) {
    commentsRequest += 1
    comments.value = initial
    commentsLoading.value = false
  }

  return { comments, commentsLoading, loadComments, resetComments }
}
