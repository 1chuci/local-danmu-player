import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import { readLocalMkvSubtitles } from './localMkvSubtitles'
import { decodeSubtitleText } from './encoding'

const MAX_EMBEDDED_SUBTITLE_SIZE = 512 * 1024 ** 2

function formatGigabytes(bytes: number) {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

export interface SubtitleCue {
  start: number
  end: number
  text: string
}

let ffmpegPromise: Promise<FFmpeg> | undefined

function parseTime(value: string) {
  const normalized = value.trim().replace(',', '.')
  const parts = normalized.split(':').map(Number)
  if (parts.some((part) => !Number.isFinite(part))) return NaN
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return Number(normalized)
}

function cleanSubtitleText(value: string) {
  return value
    .replace(/\\N|\\n/g, '\n')
    .replace(/\\h/g, ' ')
    .replace(/\{\\[^}]*\}/g, '')
    .replace(/<\/?(?:font|b|i|u|s|strong|em|ruby|rt|br)(?:\s[^>]*)?>/gi, '')
    .trim()
}

export function parseSrt(source: string): SubtitleCue[] {
  return source
    .replace(/^\uFEFF/, '')
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n').map((line) => line.trimEnd())
      const timingIndex = lines.findIndex((line) => line.includes('-->'))
      if (timingIndex < 0) return undefined
      const timing = lines[timingIndex].match(/([^\s]+)\s*-->\s*([^\s]+)/)
      if (!timing) return undefined
      const start = parseTime(timing[1])
      const end = parseTime(timing[2])
      const text = cleanSubtitleText(lines.slice(timingIndex + 1).join('\n'))
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text) return undefined
      return { start, end, text }
    })
    .filter((cue): cue is SubtitleCue => Boolean(cue))
    .sort((left, right) => left.start - right.start)
}

export function parseAss(source: string): SubtitleCue[] {
  let section = ''
  let eventFields: string[] = []
  const cues: SubtitleCue[] = []
  for (const rawLine of source.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n')) {
    const line = rawLine.trim()
    const sectionMatch = /^\[([^\]]+)\]$/.exec(line)
    if (sectionMatch) {
      section = sectionMatch[1].toLowerCase()
      continue
    }
    if (section !== 'events') continue
    if (/^format\s*:/i.test(line)) {
      eventFields = line.slice(line.indexOf(':') + 1).split(',').map((field) => field.trim().toLowerCase())
      continue
    }
    if (!/^dialogue\s*:/i.test(line) || !eventFields.length) continue
    const raw = line.slice(line.indexOf(':') + 1).trimStart()
    const textIndex = eventFields.indexOf('text')
    if (textIndex < 0) continue
    const values: string[] = []
    let rest = raw
    let valid = true
    for (let index = 0; index < textIndex; index += 1) {
      const comma = rest.indexOf(',')
      if (comma < 0) { valid = false; break }
      values.push(rest.slice(0, comma))
      rest = rest.slice(comma + 1)
    }
    if (!valid) continue
    const afterText: string[] = []
    for (let index = eventFields.length - 1; index > textIndex; index -= 1) {
      const comma = rest.lastIndexOf(',')
      if (comma < 0) { valid = false; break }
      afterText.unshift(rest.slice(comma + 1))
      rest = rest.slice(0, comma)
    }
    if (!valid) continue
    values.push(rest, ...afterText)
    const start = parseTime(values[eventFields.indexOf('start')] || '')
    const end = parseTime(values[eventFields.indexOf('end')] || '')
    const text = cleanSubtitleText(values[textIndex] || '')
    if (Number.isFinite(start) && Number.isFinite(end) && end > start && text) cues.push({ start, end, text })
  }
  return cues.sort((left, right) => left.start - right.start)
}

async function getFFmpeg() {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const sources = [
        { coreURL: '/ffmpeg/ffmpeg-core.js', wasmURL: '/ffmpeg/ffmpeg-core.wasm' },
        { coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js', wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm' },
        { coreURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js', wasmURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm' },
      ]
      const errors: string[] = []
      for (const source of sources) {
        const ffmpeg = new FFmpeg()
        try {
          await ffmpeg.load({
            coreURL: await toBlobURL(source.coreURL, 'text/javascript'),
            wasmURL: await toBlobURL(source.wasmURL, 'application/wasm'),
          })
          return ffmpeg
        } catch (error) {
          const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
          errors.push(`${source.coreURL}: ${message}`)
          console.error('[字幕解析] FFmpeg 加载失败', source.coreURL, error)
          ffmpeg.terminate()
        }
      }
      throw new Error(`字幕解析组件加载失败：${errors.join('；')}`)
    })().catch((error) => {
      ffmpegPromise = undefined
      throw error
    })
  }
  return ffmpegPromise
}

const TEXT_SUBTITLE_CODECS = new Set(['subrip', 'srt', 'ass', 'ssa', 'mov_text', 'webvtt', 'vtt', 'timed_text', 'text'])

async function detectTextSubtitleStreams(ffmpeg: FFmpeg, inputName: string) {
  const logs: string[] = []
  const onLog = (event: { type: string; message: string }) => {
    if (event.type === 'stderr') logs.push(event.message)
  }
  ffmpeg.on('log', onLog)
  try {
    await ffmpeg.exec(['-hide_banner', '-i', inputName, '-t', '0.1', '-f', 'null', '-'])
  } catch {
    // 无输出文件时 ffmpeg 可能返回非 0，但 stderr 已包含流信息
  } finally {
    ffmpeg.off('log', onLog)
  }
  const output = logs.join('\n')
  const codecs = [...output.matchAll(/Stream #\d+:\d+(?:\([^)]*\))?: Subtitle: (\w+)/g)].map((match) => match[1].toLowerCase())
  return codecs
    .map((codec, index) => (TEXT_SUBTITLE_CODECS.has(codec) ? index : -1))
    .filter((index) => index >= 0)
}

export async function extractEmbeddedSubtitles(file: File, onProgress?: (progress: number) => void, signal?: AbortSignal) {
  signal?.throwIfAborted()
  if (/\.(mkv|webm)$/i.test(file.name)) {
    const tracks = await readLocalMkvSubtitles(file, signal)
    for (const track of tracks) {
      const source = decodeSubtitleText(track.subtitle)
      const cues = track.type === 'ass' || track.type === 'ssa' ? parseAss(source) : parseSrt(source)
      if (cues.length) { onProgress?.(1); return cues }
    }
    const error = new Error('未找到可解析的文字字幕轨道（视频可能没有内嵌字幕，或只有图形字幕）')
    error.name = 'NoTextSubtitleError'
    throw error
  }
  if (file.size > MAX_EMBEDDED_SUBTITLE_SIZE) {
    const error = new Error(`本地非 MKV/WebM 视频（${formatGigabytes(file.size)}）的整文件字幕提取上限为 512 MB，请改用外挂字幕`)
    error.name = 'EmbeddedSubtitleSizeError'
    throw error
  }
  const ffmpeg = await getFFmpeg()
  const inputName = 'input-video.mkv'
  const progressHandler = ({ progress }: { progress: number }) => onProgress?.(Math.max(0, Math.min(1, progress)))
  ffmpeg.on('progress', progressHandler)
  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file))
    const textStreams = await detectTextSubtitleStreams(ffmpeg, inputName)
    if (!textStreams.length) throw new Error('未找到可解析的文字字幕轨道（视频可能没有内嵌字幕，或只有图形字幕）')
    let lastError = ''
    for (const streamIndex of textStreams) {
      const outputName = `embedded-subtitles-${streamIndex}.srt`
      try {
        const exitCode = await ffmpeg.exec(['-loglevel', 'error', '-i', inputName, '-map', `0:s:${streamIndex}`, '-c:s', 'srt', outputName])
        if (exitCode !== 0) {
          lastError = '字幕轨道转换失败'
          await ffmpeg.deleteFile(outputName).catch(() => undefined)
          continue
        }
        const output = await ffmpeg.readFile(outputName, 'utf8')
        const source = typeof output === 'string' ? output : new TextDecoder().decode(output)
        const cues = parseSrt(source)
        await ffmpeg.deleteFile(outputName).catch(() => undefined)
        if (cues.length) return cues
        lastError = '字幕轨道为空'
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        await ffmpeg.deleteFile(outputName).catch(() => undefined)
      }
    }
    throw new Error(lastError || '未找到可解析的文字字幕轨道')
  } finally {
    ffmpeg.off('progress', progressHandler)
    await ffmpeg.deleteFile(inputName).catch(() => undefined)
  }
}

export async function parseSubtitleFile(file: File): Promise<SubtitleCue[]> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.srt')) {
    const cues = parseSrt(await file.text())
    if (!cues.length) throw new Error('字幕文件为空或格式不受支持')
    return cues
  }
  if (name.endsWith('.ass') || name.endsWith('.ssa')) {
    const cues = parseAss(await file.text())
    if (!cues.length) throw new Error('ASS 字幕文件中没有有效的 Dialogue 字幕')
    return cues
  }
  if (name.endsWith('.vtt')) {
    const ffmpeg = await getFFmpeg()
    const inputName = 'external-subtitle.vtt'
    const outputName = 'external-subtitle.srt'
    try {
      await ffmpeg.writeFile(inputName, await fetchFile(file))
      const exitCode = await ffmpeg.exec(['-loglevel', 'error', '-i', inputName, '-map', '0:s:0', '-c:s', 'srt', outputName])
      if (exitCode !== 0) throw new Error('字幕转换失败')
      const output = await ffmpeg.readFile(outputName, 'utf8')
      const source = typeof output === 'string' ? output : new TextDecoder().decode(output)
      const cues = parseSrt(source)
      if (!cues.length) throw new Error('字幕文件为空或格式不受支持')
      return cues
    } finally {
      await ffmpeg.deleteFile(inputName).catch(() => undefined)
      await ffmpeg.deleteFile(outputName).catch(() => undefined)
    }
  }
  throw new Error('不支持的字幕格式，请使用 .srt / .ass / .ssa / .vtt')
}
