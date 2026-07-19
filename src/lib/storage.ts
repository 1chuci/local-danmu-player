import type { DanmakuComment, PlaybackRecord, PlayerSettings } from '../types'

const SETTINGS_KEY = 'local-danmu-player:settings'
const HISTORY_KEY = 'local-danmu-player:history'
const DB_NAME = 'local-danmu-player'
const COMMENTS_STORE = 'comments'

export const defaultSettings: PlayerSettings = {
  danmakuEnabled: true,
  opacity: 0.9,
  fontSize: 24,
  speed: 8,
  skipSeconds: 80,
}

export function loadSettings(): PlayerSettings {
  try {
    return { ...defaultSettings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }
  } catch {
    return { ...defaultSettings }
  }
}

export function saveSettings(settings: PlayerSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
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
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(COMMENTS_STORE, 'readwrite')
    transaction.objectStore(COMMENTS_STORE).put({ comments, cachedAt: Date.now() }, episodeId)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}
