import { ref } from 'vue'
import { extractEmbeddedSubtitles, type SubtitleCue } from '../lib/subtitles'

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

  function reset() {
    subtitleRequest += 1
    subtitleLoading.value = false
    subtitles.value = []
    subtitleEnabled.value = true
  }

  async function loadEmbeddedSubtitles(file: File | undefined) {
    if (!file || subtitleLoading.value) return
    const requestId = ++subtitleRequest
    subtitleLoading.value = true
    try {
      const cues = await extractEmbeddedSubtitles(file)
      if (requestId !== subtitleRequest) return
      subtitles.value = cues
      subtitleEnabled.value = true
      deps.toast(deps.t('subtitleLoaded', { count: cues.length }))
    } catch (exception) {
      if (requestId === subtitleRequest) {
        subtitles.value = []
        deps.onError(exception instanceof Error ? exception.message : deps.t('subtitleFailed'))
      }
    } finally {
      if (requestId === subtitleRequest) subtitleLoading.value = false
    }
  }

  return { subtitles, subtitleEnabled, subtitleLoading, loadEmbeddedSubtitles, reset }
}
