export type Language = 'zh-CN' | 'en-US'

export interface MatchResult {
  episodeId: number
  animeId: number
  animeTitle: string
  episodeTitle: string
  typeDescription?: string
  shift: number
}

export interface SearchAnime {
  animeId: number
  animeTitle: string
  typeDescription?: string
  episodes: Array<{
    episodeId: number
    episodeTitle: string
  }>
}

export interface RawComment {
  cid: number
  p: string
  m: string
}

export interface DanmakuComment {
  id: number
  time: number
  mode: number
  color: string
  text: string
}

export interface PlayerSettings {
  language: Language
  danmakuEnabled: boolean
  opacity: number
  fontSize: number
  speed: number
  danmakuArea: 25 | 50 | 75 | 100
  skipSeconds: number
}

export interface PlaybackRecord {
  key: string
  fileName: string
  fileSize: number
  currentTime: number
  duration: number
  episodeId?: number
  animeTitle?: string
  episodeTitle?: string
  updatedAt: number
}
