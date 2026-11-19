import { extractSubtitles, MkvParseError, RangeNotSupportedError } from '@cryguy/mkv-subtitle-extractor'
import { createWriteStream, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { probeLocalFile, extractLocalFileSrt } from './ffmpeg.mjs'

// 参考 GitHub 开源方案 @cryguy/mkv-subtitle-extractor 的原理：
// 用 HTTP Range 请求只读取 EBML 头部/SeekHead/Tracks/Cues，按需抓取字幕块，
// 带宽通常仅为整文件的 ~3%，不依赖 ffmpeg，对认证 WebDAV 更可靠。
//
// 真实文件(Hyouka.S01E01.mkv 1.5GB)实测的教训：
// - 有字幕 Cue 的文件走 readTargetedBlocks，只需 ~29MB(1.9%)、~919 次 32KB 请求。
// - 若按 4MB 大块缓存，散列的 32KB 请求会把整文件每一段都下载一遍(实测 2.5GB，
//   比整文件还多)，反而把网盘拖成"一直加载中"。所以这里改为"精确转发 Range"，
//   不做大块放大，下载量回到 ~29MB。
// - 没有字幕 Cue 的文件(mkvmerge 默认不写)走 linearScan，逐 cluster 顺序读，
//   需要读 ~14% 字节并产生海量请求。这种情况靠预算兜底：超过预算就改
//   "完整下载到临时文件 + 本地 ffmpeg"，避免 RTT 累加把请求拖死。
const BUDGET_BYTES = 150 * 1024 * 1024
const BUDGET_MS = 120000

export class RangeBudgetExceededError extends Error {
  constructor() {
    super('字幕按需提取超出预算')
    this.code = 'RANGE_BUDGET_EXCEEDED'
  }
}

export function createRangeCachingFetcher(authHeader, options = {}) {
  const headers = authHeader ? { Authorization: authHeader } : {}
  const budgetBytes = options.budgetBytes ?? BUDGET_BYTES
  const budgetMs = options.budgetMs ?? BUDGET_MS
  let totalSize = null
  let downloadedBytes = 0
  const startedAt = Date.now()
  const cache = new Map() // "start-end" -> Uint8Array

  return async (url, init = {}) => {
    if (Date.now() - startedAt > budgetMs) throw new RangeBudgetExceededError()
    if (downloadedBytes > budgetBytes) throw new RangeBudgetExceededError()

    const rangeHeader = init.headers && (init.headers.Range || init.headers.range)
    const match = /bytes=(\d+)-(\d*)/i.exec(String(rangeHeader || ''))
    if (!match) {
      return fetch(url, { ...init, headers: { ...headers, ...(init.headers || {}) } })
    }
    const start = Number(match[1])
    const requestedEnd = match[2] ? Number(match[2]) : (totalSize != null ? totalSize - 1 : start + 65536 - 1)
    const end = totalSize != null ? Math.min(requestedEnd, totalSize - 1) : requestedEnd

    const key = start + '-' + end
    let data = cache.get(key)
    if (!data) {
      const response = await fetch(url, {
        method: 'GET',
        headers: { ...headers, ...(init.headers || {}), Range: 'bytes=' + start + '-' + end },
        signal: init.signal || AbortSignal.timeout(120000),
      })
      if (response.status !== 206) return response
      const buffer = await response.arrayBuffer()
      data = new Uint8Array(buffer)
      downloadedBytes += data.length
      const contentRange = response.headers.get('content-range') || response.headers.get('Content-Range')
      const totalMatch = /bytes\s+\d+-\d+\/(\d+)/.exec(contentRange || '')
      if (totalMatch) totalSize = Number(totalMatch[1])
      if (cache.size >= 256) {
        const oldest = cache.keys().next().value
        cache.delete(oldest)
      }
      cache.set(key, data)
    }

    const total = totalSize != null ? totalSize : '*'
    return new Response(data, {
      status: 206,
      headers: {
        'Content-Range': 'bytes ' + start + '-' + (start + data.length - 1) + '/' + total,
        'Content-Length': String(data.length),
        'Accept-Ranges': 'bytes',
        'Content-Type': 'video/x-matroska',
      },
    })
  }
}

const CACHE_TTL = 5 * 60 * 1000
const CACHE_MAX = 20
const subtitleCache = new Map()

function trackToSrt(track) {
  const raw = Buffer.from(track.output.subtitle).toString('utf8')
  if (track.type === 'srt') return raw
  if (track.type === 'ass' || track.type === 'ssa') return assToSrt(raw)
  if (track.type === 'vtt') return vttToSrt(raw)
  return raw
}

function readCache(url) {
  const entry = subtitleCache.get(url)
  if (!entry) return null
  if (Date.now() - entry.fetchedAt > CACHE_TTL) {
    subtitleCache.delete(url)
    return null
  }
  return entry
}

function writeCache(url, tracks, srtByTrack) {
  if (subtitleCache.size >= CACHE_MAX) {
    const oldest = subtitleCache.keys().next().value
    subtitleCache.delete(oldest)
  }
  subtitleCache.set(url, { tracks, srtByTrack, fetchedAt: Date.now() })
}

function toFriendlyError(error) {
  if (error instanceof RangeNotSupportedError) {
    const friendly = new Error('网盘不支持 HTTP Range 请求，无法按需提取内嵌字幕')
    friendly.code = 'RANGE_NOT_SUPPORTED'
    friendly.status = 502
    return friendly
  }
  if (error instanceof MkvParseError) {
    const friendly = new Error('MKV 解析失败：' + error.message)
    friendly.code = 'MKV_PARSE_FAILED'
    friendly.status = 502
    return friendly
  }
  return error
}

async function extractAll(url, authHeader) {
  const startedAt = Date.now()
  try {
    const result = await extractSubtitles(url, { fetch: createRangeCachingFetcher(authHeader), concurrency: 8 })
    console.log('[mkv-subtitles] ' + result.length + ' tracks, ' + (Date.now() - startedAt) + 'ms, ' + url)
    return result
  } catch (error) {
    console.error('[mkv-subtitles] failed in ' + (Date.now() - startedAt) + 'ms: ' + (error?.name || 'Error') + ': ' + (error?.message || String(error)))
    throw error
  }
}

function buildResult(result) {
  const tracks = result.map((track, index) => ({
    index,
    language: track.metadata?.language || 'und',
    codec: track.type,
    name: track.metadata?.trackName || '',
  }))
  const srtByTrack = new Map()
  for (let i = 0; i < result.length; i += 1) srtByTrack.set(i, trackToSrt(result[i]))
  return { tracks, srtByTrack }
}

function trackNotFoundError() {
  const error = new Error('字幕轨道不存在')
  error.code = 'MKV_TRACK_NOT_FOUND'
  error.status = 404
  return error
}

async function downloadToTemp(url, authHeader) {
  const headers = authHeader ? { Authorization: authHeader } : {}
  const response = await fetch(url, {
    method: 'GET',
    headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(3600000),
  })
  if (!response.ok || !response.body) {
    const error = new Error('网盘文件下载失败 (' + response.status + ')')
    error.status = response.status || 502
    throw error
  }
  const contentLength = Number(response.headers.get('content-length') || 0)
  if (contentLength > 20 * 1024 * 1024 * 1024) {
    const error = new Error('文件过大，无法完整下载以提取字幕')
    error.code = 'FILE_TOO_LARGE'
    error.status = 413
    throw error
  }
  const tmpPath = join(tmpdir(), 'danmaku-player-' + randomUUID() + '.mkv')
  const nodeStream = Readable.fromWeb(response.body)
  await new Promise((resolve, reject) => {
    const out = createWriteStream(tmpPath)
    nodeStream.on('error', reject)
    out.on('error', reject)
    out.on('finish', resolve)
    nodeStream.pipe(out)
  })
  return tmpPath
}

async function extractViaDownload(url, authHeader) {
  const startedAt = Date.now()
  const filePath = await downloadToTemp(url, authHeader)
  try {
    const tracks = await probeLocalFile(filePath)
    const srtByTrack = new Map()
    for (let i = 0; i < tracks.length; i += 1) {
      srtByTrack.set(i, await extractLocalFileSrt(filePath, i))
    }
    console.log('[mkv-subtitles] full-download fallback: ' + tracks.length + ' tracks, ' + (Date.now() - startedAt) + 'ms, ' + url)
    return {
      tracks: tracks.map((track, index) => ({ index, language: track.language || 'und', codec: track.codec, name: track.name || '' })),
      srtByTrack,
    }
  } finally {
    try { unlinkSync(filePath) } catch { /* 清理失败不影响结果 */ }
  }
}

async function obtainExtraction(url, authHeader) {
  try {
    const result = await extractAll(url, authHeader)
    return buildResult(result)
  } catch (error) {
    if (error instanceof RangeBudgetExceededError || error instanceof RangeNotSupportedError) {
      console.error('[mkv-subtitles] Range 提取不可用，改用完整下载：' + (error?.message || error))
      return extractViaDownload(url, authHeader)
    }
    throw error
  }
}

export async function listMkvSubtitleTracks(url, authHeader) {
  try {
    let entry = readCache(url)
    if (!entry) {
      entry = await obtainExtraction(url, authHeader)
      writeCache(url, entry.tracks, entry.srtByTrack)
    }
    return entry.tracks
  } catch (error) {
    throw toFriendlyError(error)
  }
}

export async function extractMkvSubtitleSrt(url, authHeader, trackIndex) {
  try {
    const cached = readCache(url)
    if (cached) {
      const srt = cached.srtByTrack.get(trackIndex)
      if (srt === undefined) throw trackNotFoundError()
      return srt
    }
    const entry = await obtainExtraction(url, authHeader)
    writeCache(url, entry.tracks, entry.srtByTrack)
    const srt = entry.srtByTrack.get(trackIndex)
    if (srt === undefined) throw trackNotFoundError()
    return srt
  } catch (error) {
    throw toFriendlyError(error)
  }
}

export function assTimeToSrt(timestamp) {
  const value = String(timestamp ?? '').trim().replace(',', '.')
  const parts = value.split(':')
  if (parts.length !== 3) return '00:00:00,000'
  const hours = Number(parts[0]) || 0
  const minutes = Number(parts[1]) || 0
  const secParts = parts[2].split('.')
  const seconds = Number(secParts[0]) || 0
  const fraction = secParts[1] || '0'
  let ms = 0
  if (fraction.length === 1) ms = Number(fraction) * 100
  else if (fraction.length === 2) ms = Number(fraction) * 10
  else ms = Number(fraction)
  const pad = (n, w = 2) => String(n).padStart(w, '0')
  return pad(hours) + ':' + pad(minutes) + ':' + pad(seconds) + ',' + String(ms).padStart(3, '0')
}

export function assTextToPlain(text) {
  let result = String(text ?? '')
  while (true) {
    const open = result.indexOf('{')
    if (open < 0) break
    const close = result.indexOf('}', open)
    if (close < 0) break
    result = result.slice(0, open) + result.slice(close + 1)
  }
  return result.split('\\N').join('\n').split('\\n').join('\n').split('\\h').join(' ').trim()
}

export function assToSrt(assText) {
  const cues = []
  let index = 1
  for (const raw of String(assText ?? '').split('\n')) {
    const line = raw.replace('\r', '')
    if (!line.startsWith('Dialogue:')) continue
    const content = line.slice('Dialogue:'.length).trim()
    const parts = content.split(',')
    if (parts.length < 10) continue
    const start = assTimeToSrt(parts[1])
    const end = assTimeToSrt(parts[2])
    const text = assTextToPlain(parts.slice(9).join(','))
    if (!text) continue
    cues.push(index + '\n' + start + ' --> ' + end + '\n' + text + '\n')
    index += 1
  }
  return cues.join('\n')
}

export function vttToSrt(vttText) {
  const lines = String(vttText ?? '').split('\n')
  const cues = []
  let index = 1
  let i = 0
  while (i < lines.length && !lines[i].includes('-->')) i += 1
  for (; i < lines.length; i += 1) {
    const line = lines[i].trim()
    if (!line.includes('-->')) continue
    const parts = line.split('-->').map((part) => part.trim())
    const start = parts[0].replace('.', ',')
    const end = parts[1].split(' ')[0].replace('.', ',')
    const textLines = []
    while (i + 1 < lines.length && lines[i + 1].trim() !== '') {
      i += 1
      const text = lines[i].trim()
      if (text && !text.includes('-->')) textLines.push(text)
    }
    if (!textLines.length) continue
    cues.push(index + '\n' + start + ' --> ' + end + '\n' + textLines.join('\n') + '\n')
    index += 1
  }
  return cues.join('\n')
}
