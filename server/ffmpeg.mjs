import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

let binaryCandidates = null

export function resolveFfmpegBinary() {
  if (binaryCandidates !== null) return binaryCandidates
  const candidates = []
  try {
    const staticPath = require('ffmpeg-static')
    if (staticPath) candidates.push({ bin: staticPath, label: 'ffmpeg-static' })
  } catch {
    // ffmpeg-static 未安装，回退系统 ffmpeg
  }
  if (process.env.FFMPEG_PATH) candidates.push({ bin: process.env.FFMPEG_PATH, label: 'FFMPEG_PATH' })
  candidates.push({ bin: 'ffmpeg', label: 'system' })
  binaryCandidates = candidates
  return binaryCandidates
}

export function parseSubtitleStreams(stderrText) {
  const streams = []
  const expression = /Stream #\d+:(\d+)(?:\[[^\]]*\])?(?:\((\w+)\))?: Subtitle:\s*([^\r\n]+)/
  const lines = stderrText.split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    const match = expression.exec(lines[i])
    if (!match) continue
    streams.push({
      index: streams.length,
      language: match[2] || 'und',
      codec: match[3].trim(),
      name: readStreamTitle(lines, i + 1),
    })
  }
  return streams
}

// ffmpeg -i 会把流标题打印在紧随流信息的缩进 Metadata 块里：
//   Stream #0:3(chi): Subtitle: ass (default)
//   Metadata:
//     title           : [XKsub] 简日双语
// 多字幕轨的文件靠它区分，否则界面上只能看到“轨道 3”。
function readStreamTitle(lines, start) {
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i]
    if (!/^\s/.test(line) || /^\s*Stream #\d+:/.test(line)) break
    const match = /^\s+(?:title|handler_name)\s*:\s*(.+?)\s*$/.exec(line)
    if (match) return match[1]
  }
  return ''
}

function spawnOnce(bin, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const stdoutChunks = []
    const stderrChunks = []
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      const error = new Error('ffmpeg 执行超时')
      error.code = 'FFMPEG_TIMEOUT'
      error.status = 504
      reject(error)
    }, timeoutMs)
    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk))
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk))
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const wrapped = new Error(error.code === 'ENOENT' ? '未找到 ffmpeg 可执行文件，无法提取内嵌字幕' : `ffmpeg 启动失败: ${error.message}`)
      wrapped.code = 'FFMPEG_UNAVAILABLE'
      wrapped.status = 503
      reject(wrapped)
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, stdout: Buffer.concat(stdoutChunks), stderr: Buffer.concat(stderrChunks) })
    })
  })
}

function authArgs(authHeader) {
  return authHeader ? ['-headers', authHeader + '\r\n'] : []
}

async function runWithFallback(args, timeoutMs) {
  const candidates = resolveFfmpegBinary()
  let lastError
  for (const candidate of candidates) {
    try {
      return await spawnOnce(candidate.bin, args, timeoutMs)
    } catch (error) {
      lastError = error
      if (error.code !== 'FFMPEG_UNAVAILABLE') throw error
    }
  }
  throw lastError
}

export async function probeSubtitles({ url, authHeader }) {
  const args = ['-hide_banner', ...authArgs(authHeader), '-i', url]
  const result = await runWithFallback(args, 45000)
  const stderr = result.stderr.toString('utf8')
  if (!/Stream #\d+:\d+/.test(stderr)) {
    const tail = stderr.trim().split('\n').filter(Boolean).slice(-2).join(' ')
    const error = new Error(`无法读取视频流：${tail.slice(0, 200) || '未知错误'}`)
    error.code = 'SUBTITLE_PROBE_FAILED'
    error.status = 502
    throw error
  }
  return parseSubtitleStreams(stderr)
}

export async function extractSubtitleSrt({ url, authHeader, track }) {
  const args = ['-hide_banner', '-loglevel', 'error', ...authArgs(authHeader), '-i', url, '-map', `0:s:${track}`, '-c:s', 'srt', '-f', 'srt', '-']
  const result = await runWithFallback(args, 120000)
  if (result.code !== 0 && result.stdout.length === 0) {
    const message = result.stderr.toString('utf8').trim().split('\n').filter(Boolean).pop() || '字幕提取失败'
    const error = new Error(`内嵌字幕提取失败：${message.slice(0, 200)}`)
    error.code = 'SUBTITLE_EXTRACT_FAILED'
    error.status = 502
    throw error
  }
  return result.stdout.toString('utf8')
}

export async function probeLocalFile(filePath) {
  const args = ['-hide_banner', '-i', filePath]
  const result = await runWithFallback(args, 45000)
  const stderr = result.stderr.toString('utf8')
  if (!/Stream #\d+:\d+/.test(stderr)) {
    const tail = stderr.trim().split('\n').filter(Boolean).slice(-2).join(' ')
    const error = new Error('无法读取视频流：' + (tail.slice(0, 200) || '未知错误'))
    error.code = 'SUBTITLE_PROBE_FAILED'
    error.status = 502
    throw error
  }
  return parseSubtitleStreams(stderr)
}

export async function extractLocalFileSrt(filePath, track) {
  const args = ['-hide_banner', '-loglevel', 'error', '-i', filePath, '-map', '0:s:' + track, '-c:s', 'srt', '-f', 'srt', '-']
  const result = await runWithFallback(args, 120000)
  if (result.code !== 0 && result.stdout.length === 0) {
    const message = result.stderr.toString('utf8').trim().split('\n').filter(Boolean).pop() || '字幕提取失败'
    const error = new Error('内嵌字幕提取失败：' + (message.slice(0, 200) || ''))
    error.code = 'SUBTITLE_EXTRACT_FAILED'
    error.status = 502
    throw error
  }
  return result.stdout.toString('utf8')
}
