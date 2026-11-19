import type { SubtitleFormat } from '@cryguy/mkv-subtitle-extractor'

export interface LocalMkvTrack { type: SubtitleFormat; subtitle: Uint8Array }

export function readLocalMkvSubtitles(file: File, signal?: AbortSignal): Promise<LocalMkvTrack[]> {
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./mkvSubtitleWorker.ts', import.meta.url), { type: 'module' })
    const cleanup = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      worker.onmessage = null
      worker.onerror = null
      worker.terminate()
    }
    const fail = (error: unknown) => { cleanup(); reject(error) }
    const abort = () => fail(signal?.reason ?? new DOMException('Aborted', 'AbortError'))
    const timer = setTimeout(() => fail(new DOMException('字幕提取超时，请重试或加载外挂字幕', 'TimeoutError')), 120_000)
    worker.onmessage = ({ data }: MessageEvent<{ tracks?: LocalMkvTrack[]; error?: { name: string; message: string } }>) => {
      if (data.error) {
        const error = new Error(data.error.message)
        error.name = data.error.name
        fail(error)
      } else { cleanup(); resolve(data.tracks ?? []) }
    }
    worker.onerror = (event) => { event.preventDefault(); fail(new Error(event.message || '字幕解析失败')) }
    signal?.addEventListener('abort', abort, { once: true })
    try { worker.postMessage(file) } catch (error) { fail(error) }
  })
}
