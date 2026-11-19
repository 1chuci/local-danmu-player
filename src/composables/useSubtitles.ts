import { onScopeDispose, ref } from 'vue'
import { extractEmbeddedSubtitles, parseSrt, parseSubtitleFile, type SubtitleCue } from '../lib/subtitles'

interface SubtitleDeps {
  t: (key: string, params?: Record<string, string | number>) => string
  toast: (message: string) => void
  onError: (message: string) => void
}

export function useSubtitles(deps: SubtitleDeps) {
  const subtitles = ref<SubtitleCue[]>([])
  const subtitleEnabled = ref(true)
  const subtitleLoading = ref(false)
  let subtitleRequest = 0
  let embeddedController: AbortController | undefined

  function subtitleError(exception: unknown) {
    const keys: Record<string, string> = {
      EmbeddedSubtitleSizeError: 'localSubtitleTooLarge',
      LocalSubtitleReadLimitError: 'localSubtitleReadLimit',
      NoTextSubtitleError: 'noTextSubtitles',
      TimeoutError: 'localSubtitleTimeout',
    }
    if (!(exception instanceof Error)) return deps.t('subtitleFailed')
    return keys[exception.name] ? deps.t(keys[exception.name]) : exception.message
  }

  function reset() {
    subtitleRequest += 1
    embeddedController?.abort()
    embeddedController = undefined
    subtitleLoading.value = false
    subtitles.value = []
    subtitleEnabled.value = true
  }

  onScopeDispose(reset)

  async function loadEmbeddedSubtitles(file: File | undefined) {
    if (!file || subtitleLoading.value) return
    const requestId = ++subtitleRequest
    subtitleLoading.value = true
    const controller = new AbortController()
    embeddedController = controller
    try {
      const cues = await extractEmbeddedSubtitles(file, undefined, controller.signal)
      if (requestId !== subtitleRequest) return
      subtitles.value = cues
      subtitleEnabled.value = true
      deps.toast(deps.t('subtitleLoaded', { count: cues.length }))
    } catch (exception) {
      if (requestId === subtitleRequest) {
        subtitles.value = []
        deps.onError(subtitleError(exception))
      }
    } finally {
      if (embeddedController === controller) embeddedController = undefined
      if (requestId === subtitleRequest) subtitleLoading.value = false
    }
  }

  async function loadExternalSubtitleFile(file: File | undefined) {
    if (!file || subtitleLoading.value) return
    const requestId = ++subtitleRequest
    subtitleLoading.value = true
    try {
      const cues = await parseSubtitleFile(file)
      if (requestId !== subtitleRequest) return
      subtitles.value = cues
      subtitleEnabled.value = true
      deps.toast(deps.t('subtitleLoaded', { count: cues.length }))
    } catch (exception) {
      if (requestId === subtitleRequest) {
        subtitles.value = []
        deps.onError(subtitleError(exception))
      }
    } finally {
      if (requestId === subtitleRequest) subtitleLoading.value = false
    }
  }

  async function loadSrtText(text: string) {
    if (subtitleLoading.value) return
    const requestId = ++subtitleRequest
    subtitleLoading.value = true
    try {
      const cues = parseSrt(text)
      if (!cues.length) throw new Error(deps.t('subtitleFailed'))
      if (requestId !== subtitleRequest) return
      subtitles.value = cues
      subtitleEnabled.value = true
      deps.toast(deps.t('subtitleLoaded', { count: cues.length }))
    } catch (exception) {
      if (requestId === subtitleRequest) {
        subtitles.value = []
        deps.onError(subtitleError(exception))
      }
    } finally {
      if (requestId === subtitleRequest) subtitleLoading.value = false
    }
  }

  return { subtitles, subtitleEnabled, subtitleLoading, loadEmbeddedSubtitles, loadExternalSubtitleFile, loadSrtText, reset }
}
