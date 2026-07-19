import type { MatchResult, RawComment, SearchAnime } from '../types'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.message || `请求失败 (${response.status})`)
  }
  return data as T
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
