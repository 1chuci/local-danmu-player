<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import DanmakuOverlay from './components/DanmakuOverlay.vue'
import DanmakuSources from './components/DanmakuSources.vue'
import SubtitleOverlay from './components/SubtitleOverlay.vue'
import WebdavBrowser from './components/WebdavBrowser.vue'
import AppIcon from './components/AppIcon.vue'
import { getConfig, matchVideo, matchWebdavVideo, searchEpisodes, webdavStreamUrl, webdavSubtitleFiles, webdavSubtitleFileText, webdavSubtitleTracks, webdavSubtitleSrt } from './lib/api'
import { demoComments } from './lib/danmaku'
import { languageOptions, translate } from './lib/i18n'
import { formatTime as time } from './lib/format'
import { getRecord, loadSettings, saveRecord, saveSettings } from './lib/storage'
import { useDanmaku } from './composables/useDanmaku'
import { useSubtitles } from './composables/useSubtitles'
import { collectDroppedFiles, groupFolderFiles, isSubtitleName, isVideoName, type FolderGroup } from './lib/localFiles'
import type { DanmakuComment, MatchResult, PlaybackRecord, SearchAnime, SubtitleTrack, WebdavEntry } from './types'

const video = ref<HTMLVideoElement>()
const danmakuSources = ref<InstanceType<typeof DanmakuSources>>()
const frame = ref<HTMLElement>()
const input = ref<HTMLInputElement>()
const file = ref<File>()
const url = ref('')
const fileKey = ref('')
const hash = ref('')
const duration = ref(0)
const currentTime = ref(0)
const playing = ref(false)
const playbackRate = ref(1)
const volume = ref(1)
const muted = ref(false)
const loading = ref(false)
const configured = ref(false)
const notice = ref('')
const error = ref('')
const matches = ref<MatchResult[]>([])
const selected = ref<MatchResult>()
const keyword = ref('')
const searchResults = ref<SearchAnime[]>([])
const showSearch = ref(false)
const showSettings = ref(false)
const showWebdav = ref(false)
const webdavSource = ref<{ name: string; path: string }>()
const webdavToken = ref('')
const webdavPlaylist = ref<WebdavEntry[]>([])
const manualDanmakuSource = ref(false)
const subtitleTracks = ref<SubtitleTrack[]>([])
const siblingSubtitleFiles = ref<WebdavEntry[]>([])
const siblingSubtitleLoading = ref(false)
const siblingSubtitleChecked = ref(false)
const subtitleTracksLoading = ref(false)
const subtitleTracksChecked = ref(false)
const showSubtitleMenu = ref(false)
const subtitleMenuButton = ref<HTMLButtonElement>()
const subtitleMenu = ref<HTMLElement>()
const subtitleMenuStyle = ref<Record<string, string>>({})
const webFullscreen = ref(false)
const nativeFullscreen = ref(false)
const seeking = ref(false)
const controlsVisible = ref(true)
const showPlaybackRates = ref(false)
const settings = reactive(loadSettings())
const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 3.5, 4]
const playbackRateOptions = [...playbackRates].reverse()
let activePointerId: number | undefined
let timer: number | undefined
let identifyToken = 0
let searchRequest = 0
let lastProgressSave = 0
let metaReady = false

const language = computed(() => settings.language)
const t = (key: string, params: Record<string, string | number> = {}) => translate(language.value, key, params)
const demoMode = computed(() => !configured.value)
const title = computed(() => selected.value
  ? `${selected.value.animeTitle} - ${selected.value.episodeTitle || t('episode', { number: '?' })}`
  : webdavSource.value?.name || file.value?.name || t('noVideoSelected'))
const progress = computed(() => duration.value ? currentTime.value / duration.value * 100 : 0)
const toast = (message: string) => {
  notice.value = message
  clearTimeout(timer)
  timer = window.setTimeout(() => notice.value = '', 4500)
}
const applyLanguage = () => {
  document.documentElement.lang = language.value
  saveSettings(settings)
}

const setError = (message: string) => { error.value = message }
const subtitleInput = ref<HTMLInputElement>()
const folderInput = ref<HTMLInputElement>()
const folderVideos = ref<File[]>([])
let folderGroup: FolderGroup = { videos: [], subtitlesByBase: new Map() }
const { comments, commentsLoading, loadComments, resetComments } = useDanmaku({ t, toast, onError: setError })
const { subtitles, subtitleEnabled, subtitleLoading, loadEmbeddedSubtitles, loadExternalSubtitleFile, loadSrtText, reset: resetSubtitles } = useSubtitles({ t, toast, onError: setError })

function syncNativeFullscreen() {
  nativeFullscreen.value = document.fullscreenElement === frame.value
}

async function toggleNativeFullscreen() {
  if (!frame.value) return
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else if (frame.value.requestFullscreen) await frame.value.requestFullscreen()
    else toast(t('fullscreenUnavailable'))
  } catch {
    toast(t('fullscreenUnavailable'))
  }
}

function toggleWebFullscreen() {
  if (!url.value) return
  webFullscreen.value = !webFullscreen.value
  document.body.style.overflow = webFullscreen.value ? 'hidden' : ''
}

function hashFile(videoFile: File) {
  return new Promise<string>((resolve, reject) => {
    const worker = new Worker(new URL('./lib/hashWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<string>) => {
      worker.terminate()
      resolve(event.data)
    }
    worker.onerror = (event) => {
      worker.terminate()
      reject(new Error(event.message || '哈希计算失败'))
    }
    videoFile.slice(0, 16 * 1024 * 1024).arrayBuffer()
      .then((buffer) => worker.postMessage(buffer, [buffer]))
      .catch((exception) => {
        worker.terminate()
        reject(exception)
      })
  })
}

async function choose(videoFile?: File) {
  if (!videoFile || (!videoFile.type.startsWith('video/') && !/\.(mkv|mp4|webm|avi|mov|m4v|ts)$/i.test(videoFile.name))) {
    error.value = t('chooseVideoError')
    return
  }
  error.value = ''
  persistProgress()
  if (url.value) URL.revokeObjectURL(url.value)
  file.value = videoFile
  webdavSource.value = undefined
  webdavToken.value = ''
  webdavPlaylist.value = []
  subtitleTracks.value = []
  subtitleTracksLoading.value = false
  subtitleTracksChecked.value = false
  showSubtitleMenu.value = false
  metaReady = false
  url.value = URL.createObjectURL(videoFile)
  fileKey.value = `${videoFile.name}:${videoFile.size}:${videoFile.lastModified}`
  hash.value = ''
  duration.value = 0
  currentTime.value = 0
  playbackRate.value = 1
  matches.value = []
  selected.value = undefined
  manualDanmakuSource.value = false
  resetComments(demoMode.value ? [...demoComments] : [])
  loading.value = false
  resetSubtitles()
  identifyToken += 1
  await nextTick()
  video.value?.load()
}

async function metadata() {
  duration.value = video.value?.duration || 0
  metaReady = true
  if (video.value) {
    video.value.playbackRate = playbackRate.value
    video.value.volume = volume.value
    video.value.muted = muted.value
  }
  const record = fileKey.value ? getRecord(fileKey.value) : undefined
  if (record && record.currentTime > 5 && record.currentTime < duration.value - 5 && video.value) {
    video.value.currentTime = record.currentTime
    currentTime.value = record.currentTime
    toast(t('resumedAt', { time: time(record.currentTime) }))
  }
  if (file.value && !hash.value) {
    const videoFile = file.value
    const token = identifyToken
    loading.value = true
    try {
      const fileHash = await hashFile(videoFile)
      if (token !== identifyToken || file.value !== videoFile) return
      hash.value = fileHash
      if (configured.value) await identify()
      else toast(t('configureForLive'))
    } catch (exception) {
      if (token === identifyToken) error.value = exception instanceof Error ? exception.message : t('identificationFailed')
    } finally {
      if (token === identifyToken) loading.value = false
    }
  }
  if (webdavSource.value && !matches.value.length) {
    if (configured.value) void identifyRemote()
    else toast(t('configureForLive'))
  }
  // Embedded extraction is intentionally user-triggered from the CC control.
  // A folder may contain a matching external subtitle; auto-extracting here
  // can race with that load and wastefully block the external file.
  if (webdavSource.value && webdavToken.value && !subtitleTracksChecked.value) {
    subtitleTracksChecked.value = true
    void loadSubtitleTracks()
  }
}

async function identify() {
  if (!file.value || !hash.value) return
  const videoFile = file.value
  const fileHash = hash.value
  const token = identifyToken
  const result = await matchVideo({ fileName: videoFile.name, fileHash, fileSize: videoFile.size, videoDuration: duration.value })
  if (token !== identifyToken || file.value !== videoFile) return
  matches.value = result.matches || []
  if (result.isMatched && matches.value.length === 1) {
    await select(matches.value[0], true)
    toast(t('exactMatchFound'))
  } else {
    toast(matches.value.length ? t('possibleMatches', { count: matches.value.length }) : t('noMatch'))
  }
}

async function identifyRemote() {
  if (!webdavSource.value) return
  const source = webdavSource.value
  const token = identifyToken
  loading.value = true
  try {
    const result = await matchWebdavVideo({ fileName: source.name })
    if (token !== identifyToken || webdavSource.value !== source) return
    matches.value = result.matches || []
    if (result.isMatched && matches.value.length === 1) {
      await select(matches.value[0], true)
      toast(t('exactMatchFound'))
    } else {
      toast(matches.value.length ? t('possibleMatches', { count: matches.value.length }) : t('noMatch'))
    }
  } catch (exception) {
    if (token === identifyToken) error.value = exception instanceof Error ? exception.message : t('identificationFailed')
  } finally {
    if (token === identifyToken) loading.value = false
  }
}

async function select(match?: MatchResult, automatic = false) {
  if (!match || (automatic && manualDanmakuSource.value)) return
  manualDanmakuSource.value = false
  const sourceId = identifyToken
  selected.value = match
  await loadComments(match.episodeId)
  if (sourceId === identifyToken && selected.value === match && fileKey.value) {
    saveRecord({ key: fileKey.value, fileName: webdavSource.value?.name || file.value?.name || '', fileSize: file.value?.size || 0, currentTime: currentTime.value, duration: duration.value, episodeId: match.episodeId, animeTitle: match.animeTitle, episodeTitle: match.episodeTitle, updatedAt: Date.now() })
  }
}

function applyManualDanmaku(comments: DanmakuComment[], label: string) {
  manualDanmakuSource.value = true
  selected.value = undefined
  resetComments(comments)
  toast(label)
}

function chooseRemote(entry: WebdavEntry, token: string, playlist: WebdavEntry[]) {
  webdavPlaylist.value = playlist.some((item) => item.path === entry.path) ? playlist : []
  return openRemoteVideo(entry, token)
}

function playWebdavEpisode(entry: WebdavEntry) {
  if (!webdavToken.value || entry.path === webdavSource.value?.path) return
  void openRemoteVideo(entry, webdavToken.value, true)
}

async function openRemoteVideo(entry: WebdavEntry, token: string, autoplay = false) {
  error.value = ''
  persistProgress()
  if (url.value) URL.revokeObjectURL(url.value)
  file.value = undefined
  webdavSource.value = { name: entry.name, path: entry.path }
  webdavToken.value = token
  subtitleTracks.value = []
  subtitleTracksLoading.value = false
  siblingSubtitleFiles.value = []
  siblingSubtitleChecked.value = false
  siblingSubtitleLoading.value = false
  subtitleTracksChecked.value = false
  showSubtitleMenu.value = false
  metaReady = false
  url.value = webdavStreamUrl(token, entry.path)
  fileKey.value = `webdav:${entry.path}`
  hash.value = ''
  duration.value = 0
  currentTime.value = 0
  playbackRate.value = 1
  matches.value = []
  selected.value = undefined
  manualDanmakuSource.value = false
  resetComments(demoMode.value ? [...demoComments] : [])
  loading.value = false
  resetSubtitles()
  const requestId = ++identifyToken
  showWebdav.value = false
  await nextTick()
  if (requestId !== identifyToken || !video.value) return
  video.value.load()
  if (autoplay) void video.value.play().catch(() => { /* The user can retry with the play control. */ })
}

async function search() {
  if (keyword.value.trim().length < 2) {
    error.value = t('searchMin')
    return
  }
  const requestId = ++searchRequest
  loading.value = true
  try {
    const result = await searchEpisodes(keyword.value.trim())
    if (requestId !== searchRequest) return
    searchResults.value = result.animes || []
  } catch (exception) {
    if (requestId !== searchRequest) return
    error.value = exception instanceof Error ? exception.message : t('searchFailed')
  } finally {
    if (requestId === searchRequest) loading.value = false
  }
}

async function chooseEpisode(anime: SearchAnime, episode: SearchAnime['episodes'][number]) {
  await select({ episodeId: episode.episodeId, animeId: anime.animeId, animeTitle: anime.animeTitle, episodeTitle: episode.episodeTitle, shift: 0 })
  showSearch.value = false
}

function toggle() {
  if (!video.value || !url.value) return
  video.value.paused ? video.value.play().catch(() => {}) : video.value.pause()
}

function playNextEpisode() {
  paused()
  if (!settings.autoNext || !webdavSource.value) return
  const index = webdavPlaylist.value.findIndex((entry) => entry.path === webdavSource.value?.path)
  if (index < 0) return
  const next = webdavPlaylist.value[index + 1]
  if (next) playWebdavEpisode(next)
}

function setPlaybackRate(rate: number) {
  const next = Number.isFinite(rate) && playbackRates.some((value) => value === rate) ? rate : 1
  playbackRate.value = next
  if (video.value && video.value.playbackRate !== next) video.value.playbackRate = next
}

function changePlaybackRate(event: Event) {
  setPlaybackRate(Number((event.target as HTMLSelectElement).value))
}

function selectPlaybackRate(rate: number) {
  setPlaybackRate(rate)
  showPlaybackRates.value = false
}

function revealControls() {
  controlsVisible.value = true
}

function hideControls() {
  controlsVisible.value = false
  showPlaybackRates.value = false
}

function syncPlaybackRate() {
  playbackRate.value = video.value?.playbackRate || 1
}

function toggleMute() {
  muted.value = !muted.value
  if (video.value) video.value.muted = muted.value
}

function toggleDanmaku() {
  settings.danmakuEnabled = !settings.danmakuEnabled
  saveSettings(settings)
}

function chooseSubtitleFile(event: Event) {
  const target = event.target as HTMLInputElement
  loadExternalSubtitleFile(target.files?.[0])
  target.value = ''
}

function handleSubtitleClick() {
  if (subtitles.value.length) {
    subtitleEnabled.value = !subtitleEnabled.value
    return
  }
  if (webdavSource.value) {
    toggleSubtitleMenu()
    return
  }
  if (file.value) void loadEmbeddedSubtitles(file.value)
  else subtitleInput.value?.click()
}

function positionSubtitleMenu() {
  const button = subtitleMenuButton.value
  const menu = subtitleMenu.value
  if (!button || !menu) return
  const anchor = button.getBoundingClientRect()
  const width = menu.offsetWidth
  const height = menu.offsetHeight
  const gap = 8
  const left = Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8))
  const above = anchor.top - height - gap
  const top = Math.max(8, Math.min(above >= 8 ? above : anchor.bottom + gap, window.innerHeight - height - 8))
  subtitleMenuStyle.value = { left: `${left}px`, top: `${top}px` }
}

function toggleSubtitleMenu() {
  showSubtitleMenu.value = !showSubtitleMenu.value
  if (showSubtitleMenu.value) {
    void nextTick(positionSubtitleMenu)
    if (webdavSource.value && !siblingSubtitleChecked.value) void loadWebdavSiblingSubtitles()
  }
}

function trackLabel(track: SubtitleTrack) {
  const name = track.name?.trim()
  const lang = track.language && track.language !== 'und' ? ` · ${track.language}` : ''
  const codec = track.codec ? ` · ${track.codec}` : ''
  return name ? `${name}${lang}` : `${t('subtitleTrack')} ${track.index + 1}${lang}${codec}`
}

async function loadSubtitleTracks() {
  if (!webdavSource.value || !webdavToken.value) return
  const source = webdavSource.value
  const token = webdavToken.value
  const requestToken = identifyToken
  subtitleTracksLoading.value = true
  try {
    const result = await webdavSubtitleTracks(token, source.path)
    if (requestToken !== identifyToken || webdavSource.value !== source) return
    subtitleTracks.value = result.tracks || []
  } catch {
    if (requestToken === identifyToken) subtitleTracks.value = []
  } finally {
    if (requestToken === identifyToken) subtitleTracksLoading.value = false
  }
}

async function loadWebdavSiblingSubtitles() {
  if (!webdavSource.value || !webdavToken.value || siblingSubtitleLoading.value) return
  const source = webdavSource.value
  const token = webdavToken.value
  const requestToken = identifyToken
  siblingSubtitleLoading.value = true
  siblingSubtitleChecked.value = true
  try {
    const result = await webdavSubtitleFiles(token, source.path)
    if (requestToken === identifyToken && webdavSource.value === source) siblingSubtitleFiles.value = result.entries || []
  } catch (exception) {
    if (requestToken === identifyToken) {
      siblingSubtitleChecked.value = false
      error.value = exception instanceof Error ? exception.message : t('subtitleFailed')
    }
  } finally {
    if (requestToken === identifyToken) siblingSubtitleLoading.value = false
  }
}

async function pickWebdavSiblingSubtitle(entry: WebdavEntry) {
  if (!webdavToken.value || !webdavSource.value) return
  const source = webdavSource.value
  const token = webdavToken.value
  showSubtitleMenu.value = false
  try {
    const text = await webdavSubtitleFileText(token, entry.path)
    if (webdavSource.value !== source) return
    await loadExternalSubtitleFile(new File([text], entry.name, { type: 'text/plain' }))
  } catch (exception) {
    if (webdavSource.value === source) error.value = exception instanceof Error ? exception.message : t('subtitleFailed')
  }
}

async function pickSubtitleTrack(track: SubtitleTrack) {
  if (!webdavSource.value || !webdavToken.value) return
  const source = webdavSource.value
  showSubtitleMenu.value = false
  try {
    const srt = await webdavSubtitleSrt(webdavToken.value, source.path, track.index)
    if (webdavSource.value === source) await loadSrtText(srt)
  } catch (exception) {
    if (webdavSource.value === source) error.value = exception instanceof Error ? exception.message : t('subtitleFailed')
  }
}

async function pickLocalVideo(videoFile: File) {
  folderVideos.value = []
  await choose(videoFile)
}

function openFolderFiles(files: File[]) {
  folderGroup = groupFolderFiles(files)
  if (!folderGroup.videos.length) {
    error.value = t('noVideoInFolder')
    return
  }
  if (folderGroup.videos.length === 1) {
    void pickLocalVideo(folderGroup.videos[0])
    return
  }
  folderVideos.value = folderGroup.videos
}

function chooseFolderFromInput(event: Event) {
  const target = event.target as HTMLInputElement
  openFolderFiles(Array.from(target.files || []))
  target.value = ''
}

function changeVolume(event: Event) {
  const next = Math.max(0, Math.min(1, Number((event.target as HTMLInputElement).value)))
  volume.value = next
  muted.value = next === 0
  if (video.value) {
    video.value.volume = next
    video.value.muted = muted.value
  }
}

function seekAt(clientX: number, track: HTMLElement) {
  if (!video.value || !duration.value) return
  video.value.currentTime = Math.max(0, Math.min(1, (clientX - track.getBoundingClientRect().left) / track.clientWidth)) * duration.value
}

function seek(event: MouseEvent) {
  seekAt(event.clientX, event.currentTarget as HTMLElement)
}

function startSeek(event: PointerEvent) {
  if (!video.value || !duration.value) return
  const track = event.currentTarget as HTMLElement
  activePointerId = event.pointerId
  seeking.value = true
  track.setPointerCapture(event.pointerId)
  seekAt(event.clientX, track)
  event.preventDefault()
}

function moveSeek(event: PointerEvent) {
  if (!seeking.value || event.pointerId !== activePointerId) return
  seekAt(event.clientX, event.currentTarget as HTMLElement)
}

function endSeek(event: PointerEvent) {
  if (!seeking.value || event.pointerId !== activePointerId) return
  const track = event.currentTarget as HTMLElement
  seeking.value = false
  activePointerId = undefined
  if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId)
}

function skip() {
  if (video.value) {
    video.value.currentTime = Math.min(duration.value, video.value.currentTime + settings.skipSeconds)
    toast(t('skipped', { count: settings.skipSeconds }))
  }
}

function seekBy(seconds: number) {
  if (!video.value || !duration.value) return
  video.value.currentTime = Math.max(0, Math.min(duration.value, video.value.currentTime + seconds))
}

function persistProgress() {
  if (!metaReady || !fileKey.value) return
  saveRecord({ key: fileKey.value, fileName: webdavSource.value?.name || file.value?.name || '', fileSize: file.value?.size || 0, currentTime: currentTime.value, duration: duration.value, episodeId: selected.value?.episodeId, animeTitle: selected.value?.animeTitle, episodeTitle: selected.value?.episodeTitle, updatedAt: Date.now() })
}

function update() {
  currentTime.value = video.value?.currentTime || 0
  const now = Date.now()
  if (now - lastProgressSave > 5000) {
    persistProgress()
    lastProgressSave = now
  }
}

function paused() {
  playing.value = false
  persistProgress()
}

async function drop(event: DragEvent) {
  event.preventDefault()
  const files = await collectDroppedFiles(event.dataTransfer)
  if (files.length) {
    const videos = files.filter((item) => isVideoName(item.name))
    const subs = files.filter((item) => isSubtitleName(item.name))
    if (videos.length) {
      openFolderFiles(files)
      return
    }
    if (subs.length === 1) {
      loadExternalSubtitleFile(subs[0])
      return
    }
    const xml = files.find((item) => /\.xml$/i.test(item.name))
    if (xml) {
      await danmakuSources.value?.importXmlFile(xml)
      return
    }
    if (files.length === 1) {
      choose(files[0])
      return
    }
  }
  choose(event.dataTransfer?.files?.[0])
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (showWebdav.value) showWebdav.value = false
    if (showSettings.value) showSettings.value = false
    if (webFullscreen.value) toggleWebFullscreen()
    if (document.fullscreenElement) void document.exitFullscreen()
    return
  }
  if (showSettings.value) return
  const target = event.target as HTMLElement | null
  if (target && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) return
  if (!url.value || event.ctrlKey || event.altKey || event.metaKey) return

  switch (event.code) {
    case 'Space':
      event.preventDefault()
      toggle()
      break
    case 'ArrowLeft':
      event.preventDefault()
      seekBy(-5)
      break
    case 'ArrowRight':
      event.preventDefault()
      seekBy(5)
      break
    case 'KeyJ':
      event.preventDefault()
      seekBy(-10)
      break
    case 'KeyL':
      event.preventDefault()
      seekBy(10)
      break
    case 'KeyK':
      event.preventDefault()
      toggle()
      break
    case 'KeyF':
      event.preventDefault()
      void toggleNativeFullscreen()
      break
    case 'KeyW':
      event.preventDefault()
      toggleWebFullscreen()
      break
    case 'KeyM':
      event.preventDefault()
      toggleDanmaku()
      break
    case 'Home':
      event.preventDefault()
      if (video.value) video.value.currentTime = 0
      break
    case 'End':
      event.preventDefault()
      if (video.value) video.value.currentTime = duration.value
      break
  }
}

function save() {
  saveSettings(settings)
  showSettings.value = false
  applyLanguage()
  toast(t('settingsSaved'))
}

onMounted(async () => {
  applyLanguage()
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', positionSubtitleMenu)
  window.addEventListener('scroll', positionSubtitleMenu, true)
  window.addEventListener('beforeunload', persistProgress)
  document.addEventListener('fullscreenchange', syncNativeFullscreen)
  try {
    configured.value = (await getConfig()).dandanplayConfigured
  } catch {
    configured.value = false
  }
})

onBeforeUnmount(() => {
  if (url.value) URL.revokeObjectURL(url.value)
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', positionSubtitleMenu)
  window.removeEventListener('scroll', positionSubtitleMenu, true)
  window.removeEventListener('beforeunload', persistProgress)
  document.removeEventListener('fullscreenchange', syncNativeFullscreen)
  document.body.style.overflow = ''
  clearTimeout(timer)
})
</script>

<template>
  <main class="app" @dragover.prevent @drop="drop">
    <header>
      <div class="brand"><b><AppIcon name="play" /></b><span>{{ t('localDanmuPlayer') }}<small>LOCAL DANMU PLAYER</small></span></div>
      <div class="header-actions">
        <i :class="{ live: !demoMode }">{{ demoMode ? t('demoMode') : t('apiConnected') }}</i>
        <select v-model="settings.language" class="language-select" :aria-label="t('language')" @change="applyLanguage">
          <option v-for="option in languageOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
        <button class="header-settings" :aria-label="t('playerSettings')" :title="t('playerSettings')" @click="showSettings = true"><AppIcon name="settings" /></button>
      </div>
    </header>

    <section class="layout">
      <div class="player">
        <div v-if="!file && !webdavSource" class="drop">
          <span class="eyebrow">{{ t('yourCinema') }}</span>
          <strong class="drop-icon"><AppIcon name="video" /></strong>
          <h1>{{ t('startWatching') }}</h1><p>{{ t('dropVideoHere') }}</p>
          <div class="source-actions">
            <button class="primary" @click="input?.click()"><AppIcon name="video" />{{ t('chooseVideo') }}</button>
            <button class="outline" @click="folderInput?.click()"><AppIcon name="folder" />{{ t('openFolder') }}</button>
            <button class="outline" @click="showWebdav = true"><AppIcon name="cloud" />{{ t('webdavOpen') }}</button>
          </div>
          <div class="drop-features"><span><AppIcon name="subtitles" />ASS / SRT / VTT</span><span><AppIcon name="shield" />{{ t('videoReadLocally') }}</span></div>
        </div>
        <div v-else ref="frame" class="frame" :class="{ 'web-fullscreen': webFullscreen }" @mouseenter="revealControls" @mousemove="revealControls" @mouseleave="hideControls">
          <video ref="video" :src="url" @loadedmetadata="metadata" @timeupdate="update" @play="playing = true" @pause="paused" @ended="playNextEpisode" @ratechange="syncPlaybackRate" @click="toggle" />
          <SubtitleOverlay :cues="subtitles" :current-time="currentTime" :enabled="subtitleEnabled" />
          <DanmakuOverlay :comments="comments" :media="video" :enabled="settings.danmakuEnabled" :opacity="settings.opacity" :font-size="settings.fontSize" :speed="settings.speed" :area="settings.danmakuArea" />
          <button v-if="!playing && !currentTime" class="bigplay" :aria-label="t('play')" @click="toggle"><AppIcon name="play" /></button>
          <div class="controls" :class="{ 'is-hidden': !controlsVisible }" @click="showPlaybackRates = false">
            <div class="track" @click="seek" @pointerdown="startSeek" @pointermove="moveSeek" @pointerup="endSeek" @pointercancel="endSeek"><span :style="{ width: `${progress}%` }" /></div>
            <div class="control-row">
              <div class="control-left">
                <button class="control-icon play-control" :aria-label="playing ? t('pause') : t('play')" :title="playing ? t('pause') : t('play')" @click="toggle"><span v-if="playing" class="pause-icon" aria-hidden="true"><i /><i /></span><span v-else class="play-icon" aria-hidden="true" /></button>
                <em class="time-display">{{ time(currentTime) }} / {{ time(duration) }}</em>
                <button class="skip-control" :aria-label="t('skipped', { count: settings.skipSeconds })" :title="t('skipped', { count: settings.skipSeconds })" @click="skip">≫ {{ settings.skipSeconds }}s</button>
              </div>
              <div class="control-right">
                <div class="playback-menu" @click.stop>
                  <button class="playback-toggle" type="button" :aria-expanded="showPlaybackRates" :aria-label="t('playbackRate')" :title="t('playbackRate')" @click="showPlaybackRates = !showPlaybackRates">{{ playbackRate }}x</button>
                  <div v-if="showPlaybackRates" class="playback-options" role="menu">
                    <button v-for="rate in playbackRateOptions" :key="rate" type="button" role="menuitem" :class="{ active: playbackRate === rate }" @click="selectPlaybackRate(rate)">{{ rate }}x</button>
                  </div>
                </div>
                <button class="control-icon volume-button" :aria-label="muted || volume === 0 ? t('unmute') : t('mute')" :title="muted || volume === 0 ? t('unmute') : t('mute')" @click="toggleMute"><AppIcon :name="muted || volume === 0 ? 'volumeOff' : 'volume'" /></button>
                <input class="volume-slider" type="range" min="0" max="1" step=".01" :value="muted ? 0 : volume" :aria-label="t('volume')" @input="changeVolume" />
                <button class="control-icon toolbar-button" :aria-label="t('playerSettings')" :title="t('playerSettings')" @click="showSettings = true"><AppIcon name="settings" /></button>
                <button class="control-icon toolbar-button" :aria-label="t('webdavOpen')" :title="t('webdavOpen')" @click="showWebdav = true"><AppIcon name="cloud" /></button>
                <input ref="subtitleInput" hidden type="file" accept=".srt,.ass,.ssa,.vtt,text/vtt,text/plain" @change="chooseSubtitleFile" />
                <button class="control-icon text-control" :class="{ active: subtitleEnabled }" :disabled="subtitleLoading" :title="subtitles.length ? (subtitleEnabled ? t('subtitleOff') : t('subtitleOn')) : (file ? t('loadSubtitle') : t('loadSubtitleFile'))" @click="handleSubtitleClick">CC</button>
                <div class="subtitle-menu-wrap" @click.stop>
                  <button ref="subtitleMenuButton" class="control-icon text-control" :title="t('subtitleTracks')" :aria-label="t('subtitleTracks')" :aria-expanded="showSubtitleMenu" @click="toggleSubtitleMenu">字幕</button>
                  <div v-if="showSubtitleMenu" ref="subtitleMenu" class="subtitle-menu" :style="subtitleMenuStyle" role="menu">
                    <template v-if="webdavSource">
                      <button v-if="siblingSubtitleLoading" type="button" role="menuitem" disabled>{{ t('loading') }}</button>
                      <template v-else-if="siblingSubtitleFiles.length">
                        <button v-for="subtitle in siblingSubtitleFiles" :key="subtitle.path" type="button" role="menuitem" @click="pickWebdavSiblingSubtitle(subtitle)">{{ subtitle.name }}</button>
                      </template>
                      <button v-else-if="siblingSubtitleChecked" type="button" role="menuitem" disabled>{{ t('noSiblingSubtitles') }}</button>
                      <button v-else type="button" role="menuitem" @click="loadWebdavSiblingSubtitles()">{{ t('detectSiblingSubtitles') }}</button>
                    </template>
                    <button v-for="track in subtitleTracks" :key="track.index" type="button" role="menuitem" @click="pickSubtitleTrack(track)">{{ trackLabel(track) }}</button>
                    <button v-if="subtitleTracksLoading" type="button" role="menuitem" disabled>{{ t('loading') }}</button>
                    <template v-if="webdavSource && !subtitleTracksLoading && !subtitleTracks.length">
                      <button type="button" role="menuitem" @click="loadSubtitleTracks()">{{ t('detectSubtitles') }}</button>
                      <button type="button" role="menuitem" disabled>{{ t('noEmbeddedSubtitles') }}</button>
                    </template>
                    <button type="button" role="menuitem" @click="subtitleInput?.click(); showSubtitleMenu = false">{{ t('loadSubtitleFile') }}</button>
                  </div>
                </div>
                <button class="control-icon text-control" :class="{ active: settings.danmakuEnabled }" :title="settings.danmakuEnabled ? t('danmakuShort') : t('danmakuOff')" @click="toggleDanmaku">弹</button>
                <button class="control-icon toolbar-button" :title="webFullscreen ? t('exitWebFullscreen') : t('webFullscreen')" :aria-label="webFullscreen ? t('exitWebFullscreen') : t('webFullscreen')" @click="toggleWebFullscreen"><AppIcon name="window" /></button>
                <button class="control-icon toolbar-button" :title="nativeFullscreen ? t('exitFullscreen') : t('fullscreen')" :aria-label="nativeFullscreen ? t('exitFullscreen') : t('fullscreen')" @click="toggleNativeFullscreen"><AppIcon :name="nativeFullscreen ? 'collapse' : 'expand'" /></button>
              </div>
            </div>
          </div>
        </div>
        <div class="now"><div class="now-title"><div class="now-meta"><span class="source-badge">{{ webdavSource ? 'WebDAV' : t('localVideo') }}</span><small>{{ file || webdavSource ? t('nowPlaying') : t('readyToPlay') }}</small></div><h2>{{ title }}</h2></div><div class="now-actions"><button class="outline" @click="input?.click()"><AppIcon name="video" />{{ t('changeVideo') }}</button><button class="outline" @click="showWebdav = true"><AppIcon name="cloud" />{{ t('webdavOpen') }}</button></div></div>
        <input ref="input" hidden type="file" accept="video/*,.mkv,.avi,.mov,.m4v,.ts" @change="choose(($event.target as HTMLInputElement).files?.[0])" />
        <input ref="folderInput" hidden type="file" webkitdirectory @change="chooseFolderFromInput" />
      </div>

      <aside>
        <section v-if="webdavSource && webdavPlaylist.length" class="card webdav-episodes" aria-labelledby="webdav-episodes-title">
          <h3 id="webdav-episodes-title">{{ t('webdavEpisodes') }} <small>{{ webdavPlaylist.length }}</small></h3>
          <div class="list episode-list">
            <button
              v-for="(episode, index) in webdavPlaylist" :key="episode.path" type="button"
              :class="{ selected: episode.path === webdavSource.path }"
              :aria-current="episode.path === webdavSource.path ? 'true' : undefined"
              @click="playWebdavEpisode(episode)"
            >
              <span class="episode-number">{{ String(index + 1).padStart(2, '0') }}</span>
              <span class="episode-copy"><b>{{ episode.name }}</b><small v-if="episode.path === webdavSource.path">{{ t('webdavCurrentEpisode') }}</small></span>
              <AppIcon v-if="episode.path === webdavSource.path" name="play" />
            </button>
          </div>
        </section>
        <div class="card"><DanmakuSources ref="danmakuSources" :source-key="fileKey + ':' + identifyToken" :language="settings.language" @loaded="applyManualDanmaku" /></div>
        <div class="card status"><h3>{{ t('serviceStatus') }}</h3><b><span :class="{ active: !demoMode }" /> {{ demoMode ? t('credentialsRequired') : t('danmakuServiceReady') }}</b><p>{{ demoMode ? t('demoCommentsShown') : t('secureProxy') }}</p></div>
        <div class="card"><h3>{{ t('matchResult') }} <small v-if="loading">{{ t('working') }}</small></h3><div v-if="matches.length" class="list"><button v-for="match in matches" :key="match.episodeId" :class="{ selected: selected?.episodeId === match.episodeId }" @click="select(match)"><b>{{ match.animeTitle }}</b><small>{{ match.episodeTitle || t('episode', { number: '?' }) }}</small></button></div><p v-else class="muted">{{ t('matchingHint') }}</p><button class="outline full" @click="showSearch = !showSearch">{{ t('manualSearch') }}</button></div>
        <div v-if="showSearch" class="card"><div class="search"><input v-model="keyword" :placeholder="t('animeTitle')" @keyup.enter="search" /><button class="primary" @click="search">{{ t('search') }}</button></div><div v-for="anime in searchResults" :key="anime.animeId" class="result"><b>{{ anime.animeTitle }}</b><button v-for="episode in anime.episodes" :key="episode.episodeId" @click="chooseEpisode(anime, episode)">{{ episode.episodeTitle || t('select') }}</button></div></div>
        <div class="card info"><h3>{{ t('localData') }}</h3><p><span>{{ t('danmaku') }}</span><b>{{ commentsLoading ? t('loading') : t('comments', { count: comments.length }) }}</b></p><p><span>{{ t('videoProcessing') }}</span><b>{{ t('local') }}</b></p><p><span>{{ t('playbackHistory') }}</span><b>{{ t('browserStorage') }}</b></p></div>
      </aside>
    </section>

    <footer>{{ t('localVideo') }} · {{ t('localProcessing') }} · {{ t('localCache') }}</footer>
    <div v-if="notice" class="toast">{{ notice }}</div>
    <div v-if="error" class="toast err">{{ error }} <button @click="error = ''">×</button></div>
    <div v-if="showSettings" class="backdrop" @click.self="showSettings = false"><section class="modal"><h2>{{ t('playerSettings') }} <button :aria-label="t('close')" @click="showSettings = false"><AppIcon name="close" /></button></h2><label>{{ t('language') }}<select v-model="settings.language" class="settings-select" @change="applyLanguage"><option v-for="option in languageOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></label><label><input v-model="settings.danmakuEnabled" type="checkbox" /> {{ t('showDanmaku') }}</label><label>{{ t('opacity') }} <output>{{ Math.round(settings.opacity * 100) }}%</output><input v-model.number="settings.opacity" type="range" min=".2" max="1" step=".05" /></label><label>{{ t('fontSize') }} <output>{{ settings.fontSize }}px</output><input v-model.number="settings.fontSize" type="range" min="16" max="42" /></label><label>{{ t('danmakuArea') }}<select v-model.number="settings.danmakuArea" class="settings-select"><option :value="25">{{ t('areaQuarter') }}</option><option :value="50">{{ t('areaHalf') }}</option><option :value="75">{{ t('areaThreeQuarters') }}</option><option :value="100">{{ t('areaFull') }}</option></select></label><label>{{ t('scrollSpeed') }} <output>{{ settings.speed }} {{ t('secondsShort') }}</output><input v-model.number="settings.speed" type="range" min="2" max="16" step="1" /></label><label><input v-model="settings.autoNext" type="checkbox" /> {{ t('autoNext') }}</label><label>{{ t('skipSeconds') }} <output>{{ settings.skipSeconds }} {{ t('secondsShort') }}</output><input v-model.number="settings.skipSeconds" type="number" min="0" max="600" step="5" /></label><p class="shortcut-help">{{ t('shortcutHelp') }}</p><button class="primary full" @click="save">{{ t('saveSettings') }}</button></section></div>
    <div v-if="folderVideos.length" class="backdrop" @click.self="folderVideos = []"><section class="modal"><h2>{{ t('chooseVideoInFolder') }} <button :aria-label="t('close')" @click="folderVideos = []"><AppIcon name="close" /></button></h2><div class="list"><button v-for="videoFile in folderVideos" :key="videoFile.name + videoFile.size" @click="pickLocalVideo(videoFile)"><b>{{ videoFile.name }}</b></button></div></section></div>
    <WebdavBrowser v-if="showWebdav" :t="t" @close="showWebdav = false" @play="chooseRemote" />
  </main>
</template>
