import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { readLocalMkvSubtitles, type LocalMkvTrack } from './localMkvSubtitles'
import { extractEmbeddedSubtitles } from './subtitles'
import { useSubtitles } from '../composables/useSubtitles'
import { translate } from './i18n'

class MockWorker {
  static instances: MockWorker[] = []
  onmessage?: (event: { data: { tracks?: LocalMkvTrack[]; error?: { name: string; message: string } } }) => void
  onerror?: (event: ErrorEvent) => void
  postMessage = vi.fn()
  terminate = vi.fn()
  constructor() { MockWorker.instances.push(this) }
}
const ass: LocalMkvTrack = { type: 'ass', subtitle: new TextEncoder().encode('[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\an8}Hello\\N字幕') }
const file = new File([], 'Anime.MKV')
Object.defineProperty(file, 'size', { value: 1_589_449_460 })
const reply = (worker: MockWorker, tracks = [ass]) => worker.onmessage?.({ data: { tracks } })

beforeEach(() => { MockWorker.instances = []; vi.stubGlobal('Worker', MockWorker) })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('local MKV subtitle extraction', () => {
  it('extracts ASS cues from a large MKV without the old 512 MB rejection', async () => {
    const promise = extractEmbeddedSubtitles(file)
    const worker = MockWorker.instances[0]
    expect(worker.postMessage).toHaveBeenCalledWith(file)
    reply(worker)
    await expect(promise).resolves.toEqual([{ start: 1, end: 3, text: 'Hello\n字幕' }])
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('keeps the whole-file FFmpeg limit for other containers', async () => {
    const mp4 = new File([], 'large.mp4')
    Object.defineProperty(mp4, 'size', { value: file.size })
    await expect(extractEmbeddedSubtitles(mp4)).rejects.toMatchObject({ name: 'EmbeddedSubtitleSizeError' })
    expect(MockWorker.instances).toHaveLength(0)
  })

  it('terminates on parser failure and allows a fresh attempt', async () => {
    const first = readLocalMkvSubtitles(file)
    MockWorker.instances[0].onmessage?.({ data: { error: { name: 'MkvParseError', message: 'bad data' } } })
    await expect(first).rejects.toMatchObject({ name: 'MkvParseError', message: 'bad data' })
    expect(MockWorker.instances[0].terminate).toHaveBeenCalledOnce()
    const second = readLocalMkvSubtitles(file)
    reply(MockWorker.instances[1])
    await expect(second).resolves.toEqual([ass])
    expect(MockWorker.instances[1].terminate).toHaveBeenCalledOnce()
  })

  it('times out and terminates the worker', async () => {
    vi.useFakeTimers()
    const promise = readLocalMkvSubtitles(file)
    const rejected = expect(promise).rejects.toMatchObject({ name: 'TimeoutError' })
    await vi.advanceTimersByTimeAsync(120_000)
    await rejected
    expect(MockWorker.instances[0].terminate).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reports no-text and budget errors with the selected language', async () => {
    const scope = effectScope()
    const onError = vi.fn()
    const subtitles = scope.run(() => useSubtitles({ t: key => translate('en-US', key), toast: vi.fn(), onError }))!
    const first = subtitles.loadEmbeddedSubtitles(file)
    reply(MockWorker.instances[0], [])
    await first
    expect(onError).toHaveBeenLastCalledWith(translate('en-US', 'noTextSubtitles'))
    const second = subtitles.loadEmbeddedSubtitles(file)
    MockWorker.instances[1].onmessage?.({ data: { error: { name: 'LocalSubtitleReadLimitError', message: 'internal detail' } } })
    await second
    expect(onError).toHaveBeenLastCalledWith(translate('en-US', 'localSubtitleReadLimit'))
    expect(subtitles.subtitleLoading.value).toBe(false)
    scope.stop()
  })

  it('cancels old extraction on source reset without replacing the new subtitles', async () => {
    const scope = effectScope()
    const onError = vi.fn()
    const subtitles = scope.run(() => useSubtitles({ t: key => key, toast: vi.fn(), onError }))!
    const first = subtitles.loadEmbeddedSubtitles(file)
    subtitles.reset()
    const second = subtitles.loadEmbeddedSubtitles(file)
    expect(MockWorker.instances[0].terminate).toHaveBeenCalledOnce()
    reply(MockWorker.instances[1])
    await second
    reply(MockWorker.instances[0], [])
    await first
    expect(subtitles.subtitles.value).toEqual([{ start: 1, end: 3, text: 'Hello\n字幕' }])
    expect(subtitles.subtitleLoading.value).toBe(false)
    expect(onError).not.toHaveBeenCalled()
    scope.stop()
  })

  it('cancels extraction when the component scope is disposed', async () => {
    const scope = effectScope()
    const subtitles = scope.run(() => useSubtitles({ t: key => key, toast: vi.fn(), onError: vi.fn() }))!
    const promise = subtitles.loadEmbeddedSubtitles(file)
    scope.stop()
    await promise
    expect(MockWorker.instances[0].terminate).toHaveBeenCalledOnce()
    expect(subtitles.subtitleLoading.value).toBe(false)
  })
})
