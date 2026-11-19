import { extractSubtitles } from '@cryguy/mkv-subtitle-extractor'

// These are read budgets, not limits on the size of the video file.
const MAX_RANGE_BYTES = 64 * 1024 ** 2
const MAX_TOTAL_BYTES = 512 * 1024 ** 2

export function createLocalFileFetcher(file: Pick<Blob, 'size' | 'slice'>): typeof fetch {
  let bytesRead = 0
  return async (input, init) => {
    const request = input instanceof Request ? input : undefined
    const signal = init?.signal ?? request?.signal
    signal?.throwIfAborted()
    const range = new Headers(init?.headers ?? request?.headers).get('range')
    const match = /^bytes=(\d+)-(\d*)$/.exec(range ?? '')
    const start = match ? Number(match[1]) : NaN
    const end = match?.[2] ? Math.min(Number(match[2]), file.size - 1) : file.size - 1
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end) {
      return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + file.size } })
    }
    const length = end - start + 1
    if (length > MAX_RANGE_BYTES || bytesRead + length > MAX_TOTAL_BYTES) {
      const error = new Error('字幕读取量超出安全预算，请改用外挂字幕')
      error.name = 'LocalSubtitleReadLimitError'
      throw error
    }
    bytesRead += length
    const data = await file.slice(start, end + 1).arrayBuffer()
    signal?.throwIfAborted()
    return new Response(data, { status: 206, headers: {
      'Content-Range': 'bytes ' + start + '-' + end + '/' + file.size,
      'Content-Length': String(data.byteLength),
      'Accept-Ranges': 'bytes',
    } })
  }
}

export async function extractLocalMkvTracks(file: File) {
  return extractSubtitles('local-mkv', {
    fetch: createLocalFileFetcher(file),
    allowFullDownload: false,
    concurrency: 1,
  })
}
