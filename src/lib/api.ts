import type { MatchResult, RawComment, SearchAnime, SubtitleTrack, WebdavConfig, WebdavEntry, WebdavListing } from '../types'
import { decodeSubtitleText } from './encoding'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60000)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data.message || `请求失败 (${response.status})`)
    }
    return data as T
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('请求超时，请重试')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export async function getConfig() {
  return request<{ dandanplayConfigured: boolean }>('/api/config')
}

export async function matchVideo(input: {
  fileName: string
  fileHash: string
  fileSize: number
  videoDuration: number
}) {
  return request<{ isMatched: boolean; matches: MatchResult[] }>('/api/dandanplay/match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function searchEpisodes(anime: string) {
  return request<{ hasMore: boolean; animes: SearchAnime[] }>(
    `/api/dandanplay/search?anime=${encodeURIComponent(anime)}`,
  )
}

export async function getComments(episodeId: number) {
  return request<{ count: number; comments: RawComment[] }>(`/api/dandanplay/comments/${episodeId}`)
}

export interface BilibiliVideo {
  bvid: string
  title: string
  pages: Array<{ page: number; cid: number; part: string; duration: number }>
}

export interface BilibiliComments {
  bvid: string
  title: string
  page: number
  cid: number
  part: string
  xml: string
}

export async function getBilibiliVideo(bvid: string) {
  return request<BilibiliVideo>(`/api/bilibili/video?bvid=${encodeURIComponent(bvid)}`)
}

export async function getBilibiliComments(bvid: string, page: number) {
  const query = new URLSearchParams({ bvid, page: String(page) })
  return request<BilibiliComments>(`/api/bilibili/comments?${query}`)
}

export async function authorizeWebdav(config: WebdavConfig) {
  return request<{ token: string }>('/api/webdav/authorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
}

export async function listWebdav(token: string, path = '') {
  const query = new URLSearchParams({ token, path })
  return request<WebdavListing>(`/api/webdav/list?${query.toString()}`)
}

export function webdavStreamUrl(token: string, path: string) {
  const query = new URLSearchParams({ token, path })
  return `/api/webdav/stream?${query.toString()}`
}

export async function matchWebdavVideo(input: { fileName: string }) {
  return request<{ isMatched: boolean; matches: MatchResult[] }>('/api/webdav/match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export async function webdavSubtitleFiles(token: string, path: string) {
  const query = new URLSearchParams({ token, path })
  return request<{ entries: WebdavEntry[] }>(`/api/webdav/subtitle-files?${query.toString()}`)
}

export async function webdavSubtitleFileText(token: string, path: string) {
  const query = new URLSearchParams({ token, path })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60000)
  try {
    const response = await fetch(`/api/webdav/subtitle-file?${query.toString()}`, { signal: controller.signal })
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (!response.ok) {
      const text = new TextDecoder().decode(bytes)
      let message = `请求失败 (${response.status})`
      try { message = JSON.parse(text).message || message } catch { /* retain status */ }
      throw new Error(message)
    }
    return decodeSubtitleText(bytes)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('字幕文件读取超时，请重试')
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export async function webdavSubtitleTracks(token: string, path: string) {
  const query = new URLSearchParams({ token, path })
  return request<{ tracks: SubtitleTrack[] }>(`/api/webdav/subtitle-tracks?${query.toString()}`)
}

export async function webdavSubtitleSrt(token: string, path: string, track: number) {
  const query = new URLSearchParams({ token, path, track: String(track) })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60000)
  try {
    const response = await fetch(`/api/webdav/subtitle?${query.toString()}`, { signal: controller.signal })
    const text = await response.text()
    if (!response.ok) {
      let message = `请求失败 (${response.status})`
      try {
        const data = JSON.parse(text)
        if (data && data.message) message = data.message
      } catch {
        // 非 JSON 响应，保留默认信息
      }
      throw new Error(message)
    }
    return text
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('字幕提取超时，请重试')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}
