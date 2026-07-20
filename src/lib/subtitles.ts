import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

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

function parseSrt(source: string): SubtitleCue[] {
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
      const text = lines.slice(timingIndex + 1).join('\n').trim()
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text) return undefined
      return { start, end, text }
    })
    .filter((cue): cue is SubtitleCue => Boolean(cue))
}

async function getFFmpeg() {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const sources = [
        { coreURL: '/ffmpeg/ffmpeg-core.js', wasmURL: '/ffmpeg/ffmpeg-core.wasm' },
        { coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.js', wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.wasm' },
        { coreURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.js', wasmURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.wasm' },
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

export async function extractEmbeddedSubtitles(file: File, onProgress?: (progress: number) => void) {
  const ffmpeg = await getFFmpeg()
  const inputName = 'input-video.mkv'
  const outputName = 'embedded-subtitles.srt'
  const progressHandler = ({ progress }: { progress: number }) => onProgress?.(Math.max(0, Math.min(1, progress)))
  ffmpeg.on('progress', progressHandler)
  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file))
    const exitCode = await ffmpeg.exec(['-loglevel', 'error', '-i', inputName, '-map', '0:s:0', '-c:s', 'srt', outputName])
    if (exitCode !== 0) throw new Error('未找到可解析的文字字幕轨道')
    const output = await ffmpeg.readFile(outputName, 'utf8')
    const source = typeof output === 'string' ? output : new TextDecoder().decode(output)
    const cues = parseSrt(source)
    if (!cues.length) throw new Error('内嵌字幕轨道为空或格式不受支持')
    return cues
  } finally {
    ffmpeg.off('progress', progressHandler)
    await ffmpeg.deleteFile(inputName).catch(() => undefined)
    await ffmpeg.deleteFile(outputName).catch(() => undefined)
  }
}
