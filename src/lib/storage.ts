import type { DanmakuComment, PlaybackRecord, PlayerSettings } from '../types'

const SETTINGS_KEY = 'local-danmu-player:settings'
const HISTORY_KEY = 'local-danmu-player:history'
const DB_NAME = 'local-danmu-player'
const COMMENTS_STORE = 'comments'
const DANMAKU_SETTINGS_VERSION = 3
type StoredSettings = Partial<PlayerSettings> & { danmakuSettingsVersion?: number }

export const defaultSettings: PlayerSettings = {
  language: 'zh-CN',
  danmakuEnabled: true,
  opacity: 0.9,
  fontSize: 20,
  speed: 12,
  danmakuArea: 25,
  skipSeconds: 80,
}

export function loadSettings(): PlayerSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') as StoredSettings
    const isLegacyDanmakuSettings = stored.danmakuSettingsVersion !== DANMAKU_SETTINGS_VERSION
    const area = [25, 50, 75, 100].includes(Number(stored.danmakuArea))
      ? Number(stored.danmakuArea) as PlayerSettings['danmakuArea']
      : defaultSettings.danmakuArea
    return {
      ...defaultSettings,
      ...stored,
      fontSize: isLegacyDanmakuSettings && Number(stored.fontSize) === 18 ? defaultSettings.fontSize : Number(stored.fontSize) || defaultSettings.fontSize,
      speed: isLegacyDanmakuSettings && Number(stored.speed) === 8 ? defaultSettings.speed : Number(stored.speed) || defaultSettings.speed,
      danmakuArea: isLegacyDanmakuSettings ? defaultSettings.danmakuArea : area,
      language: stored.language === 'en-US' ? 'en-US' : 'zh-CN',
    }
  } catch {
    return { ...defaultSettings }
  }
}

export function saveSettings(settings: PlayerSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, danmakuSettingsVersion: DANMAKU_SETTINGS_VERSION }))
}

export function getRecord(key: string): PlaybackRecord | undefined {
  try {
    const records = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as PlaybackRecord[]
    return records.find((record) => record.key === key)
  } catch {
    return undefined
  }
}

export function saveRecord(record: PlaybackRecord) {
  let records: PlaybackRecord[] = []
  try {
    records = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
  } catch {
    records = []
  }
  const next = [record, ...records.filter((item) => item.key !== record.key)]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 30)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(COMMENTS_STORE)) {
        request.result.createObjectStore(COMMENTS_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function getCachedComments(episodeId: number) {
  const database = await openDatabase()
  return new Promise<{ comments: DanmakuComment[]; cachedAt: number } | undefined>((resolve, reject) => {
    const request = database.transaction(COMMENTS_STORE, 'readonly').objectStore(COMMENTS_STORE).get(episodeId)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function cacheComments(episodeId: number, comments: DanmakuComment[]) {
  const database = await openDatabase()
  const serializableComments = comments.map((comment) => ({
    id: Number(comment.id),
    time: Number(comment.time),
    mode: Number(comment.mode),
    color: String(comment.color),
    text: String(comment.text),
  }))
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(COMMENTS_STORE, 'readwrite')
    transaction.objectStore(COMMENTS_STORE).put({ comments: serializableComments, cachedAt: Date.now() }, episodeId)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}
