import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLocalFileFetcher } from './localMkvReader'

afterEach(() => vi.unstubAllGlobals())

describe('local MKV file reads', () => {
  it('reads only requested bytes of a 1.5 GB file, including across 4 MB boundaries', async () => {
    const network = vi.fn(() => { throw new Error('Network must not be used') })
    vi.stubGlobal('fetch', network)
    const slice = vi.fn((start = 0, end = 0) => new Blob([Uint8Array.from({ length: end - start }, (_, i) => (start + i) % 251)]))
    const read = createLocalFileFetcher({ size: 1_589_449_460, slice })
    const response = await read('ignored', { headers: { Range: 'bytes=4194300-4194555' } })
    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe('bytes 4194300-4194555/1589449460')
    const bytes = new Uint8Array(await response.arrayBuffer())
    expect(bytes).toEqual(Uint8Array.from({ length: 256 }, (_, i) => (4194300 + i) % 251))
    expect(slice).toHaveBeenCalledExactlyOnceWith(4194300, 4194556)
    expect(network).not.toHaveBeenCalled()
  })

  it('clamps reads to EOF and supports open-ended ranges', async () => {
    const read = createLocalFileFetcher(new Blob(['0123456789']))
    for (const range of ['bytes=8-100', 'bytes=8-']) {
      const response = await read('ignored', { headers: { Range: range } })
      expect(response.headers.get('content-range')).toBe('bytes 8-9/10')
      expect(await response.text()).toBe('89')
    }
  })

  it('rejects invalid, whole-file, and out-of-bounds requests without reading', async () => {
    const slice = vi.fn()
    const read = createLocalFileFetcher({ size: 100, slice })
    for (const range of ['', 'bytes=9-2', 'bytes=-8', 'bytes=100-200']) {
      const response = await read('ignored', { headers: { Range: range } })
      expect(response.status).toBe(416)
    }
    expect(slice).not.toHaveBeenCalled()
  })

  it('enforces per-read and cumulative budgets before reading', async () => {
    // The fake returns a tiny blob; requested ranges still count against the budget.
    const slice = vi.fn(() => new Blob(['x']))
    const read = createLocalFileFetcher({ size: 2 * 1024 ** 3, slice })
    await expect(read('ignored', { headers: { Range: 'bytes=0-67108864' } })).rejects.toMatchObject({ name: 'LocalSubtitleReadLimitError' })
    expect(slice).not.toHaveBeenCalled()
    for (let i = 0; i < 8; i++) await read('ignored', { headers: { Range: 'bytes=0-67108863' } })
    await expect(read('ignored', { headers: { Range: 'bytes=0-0' } })).rejects.toMatchObject({ name: 'LocalSubtitleReadLimitError' })
    expect(slice).toHaveBeenCalledTimes(8)
  })

  it('honors cancellation before disk access', async () => {
    const slice = vi.fn()
    const read = createLocalFileFetcher({ size: 100, slice })
    await expect(read('ignored', { signal: AbortSignal.abort(), headers: { Range: 'bytes=0-1' } })).rejects.toMatchObject({ name: 'AbortError' })
    expect(slice).not.toHaveBeenCalled()
  })
})
