<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import SparkMD5 from 'spark-md5'
import DanmakuOverlay from './components/DanmakuOverlay.vue'
import SubtitleOverlay from './components/SubtitleOverlay.vue'
import { getComments, getConfig, matchVideo, searchEpisodes } from './lib/api'
import { demoComments, parseComments } from './lib/danmaku'
import { languageOptions, translate } from './lib/i18n'
import { cacheComments, getCachedComments, getRecord, loadSettings, saveRecord, saveSettings } from './lib/storage'
import { extractEmbeddedSubtitles } from './lib/subtitles'
import type { DanmakuComment, MatchResult, PlaybackRecord, SearchAnime } from './types'

const video = ref<HTMLVideoElement>()
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
const commentsLoading = ref(false)
const configured = ref(false)
const notice = ref('')
const error = ref('')
const matches = ref<MatchResult[]>([])
const selected = ref<MatchResult>()
const comments = ref<DanmakuComment[]>([])
const subtitles = ref<import('./lib/subtitles').SubtitleCue[]>([])
const subtitleEnabled = ref(true)
const subtitleLoading = ref(false)
const keyword = ref('')
const searchResults = ref<SearchAnime[]>([])
const showSearch = ref(false)
const showSettings = ref(false)
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
let subtitleRequest = 0

const language = computed(() => settings.language)
const t = (key: string, params: Record<string, string | number> = {}) => translate(language.value, key, params)
const demoMode = computed(() => !configured.value)
const title = computed(() => selected.value
  ? `${selected.value.animeTitle} - ${selected.value.episodeTitle || t('episode', { number: '?' })}`
  : file.value?.name || t('noVideoSelected'))
const progress = computed(() => duration.value ? currentTime.value / duration.value * 100 : 0)
const time = (value: number) => {
  const seconds = Math.max(0, Math.floor(value || 0))
  if (seconds < 3600) return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
const toast = (message: string) => {
  notice.value = message
  clearTimeout(timer)
  timer = window.setTimeout(() => notice.value = '', 4500)
}
const applyLanguage = () => {
  document.documentElement.lang = language.value
  saveSettings(settings)
}

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
  if (!file.value) return
  webFullscreen.value = !webFullscreen.value
  document.body.style.overflow = webFullscreen.value ? 'hidden' : ''
}

async function hashFile(videoFile: File) {
  return SparkMD5.ArrayBuffer.hash(await videoFile.slice(0, 16 * 1024 * 1024).arrayBuffer())
}

async function choose(videoFile?: File) {
  if (!videoFile || (!videoFile.type.startsWith('video/') && !/\.(mkv|mp4|webm|avi|mov|m4v|ts)$/i.test(videoFile.name))) {
    error.value = t('chooseVideoError')
    return
  }
  error.value = ''
  if (url.value) URL.revokeObjectURL(url.value)
  file.value = videoFile
  url.value = URL.createObjectURL(videoFile)
  fileKey.value = `${videoFile.name}:${videoFile.size}:${videoFile.lastModified}`
  hash.value = ''
  duration.value = 0
  currentTime.value = 0
  playbackRate.value = 1
  matches.value = []
  selected.value = undefined
  comments.value = demoMode.value ? [...demoComments] : []
  subtitles.value = []
  subtitleEnabled.value = true
  subtitleRequest += 1
  await nextTick()
  video.value?.load()
}

async function metadata() {
  duration.value = video.value?.duration || 0
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
    loading.value = true
    try {
      hash.value = await hashFile(file.value)
      if (configured.value) await identify()
      else toast(t('configureForLive'))
    } catch (exception) {
      error.value = exception instanceof Error ? exception.message : t('identificationFailed')
    } finally {
      loading.value = false
    }
  }
  if (file.value?.name.toLowerCase().endsWith('.mkv') && !subtitles.value.length && !subtitleLoading.value) {
    void loadEmbeddedSubtitles()
  }
}

async function loadEmbeddedSubtitles() {
  if (!file.value || subtitleLoading.value) return
  const requestId = ++subtitleRequest
  subtitleLoading.value = true
  try {
    const cues = await extractEmbeddedSubtitles(file.value)
    if (requestId !== subtitleRequest) return
    subtitles.value = cues
    subtitleEnabled.value = true
    toast(t('subtitleLoaded', { count: cues.length }))
  } catch (exception) {
    if (requestId === subtitleRequest) {
      subtitles.value = []
      error.value = exception instanceof Error ? exception.message : t('subtitleFailed')
    }
  } finally {
    if (requestId === subtitleRequest) subtitleLoading.value = false
  }
}

async function identify() {
  if (!file.value || !hash.value) return
  const result = await matchVideo({ fileName: file.value.name, fileHash: hash.value, fileSize: file.value.size, videoDuration: duration.value })
  matches.value = result.matches || []
  if (result.isMatched && matches.value.length === 1) {
    await select(matches.value[0])
    toast(t('exactMatchFound'))
  } else {
    toast(matches.value.length ? t('possibleMatches', { count: matches.value.length }) : t('noMatch'))
  }
}

async function select(match?: MatchResult) {
  if (!match) return
  selected.value = match
  await loadComments(match.episodeId)
  if (fileKey.value) {
    saveRecord({ key: fileKey.value, fileName: file.value?.name || '', fileSize: file.value?.size || 0, currentTime: currentTime.value, duration: duration.value, episodeId: match.episodeId, animeTitle: match.animeTitle, episodeTitle: match.episodeTitle, updatedAt: Date.now() })
  }
}

async function loadComments(episodeId: number) {
  commentsLoading.value = true
  try {
    const cached = await getCachedComments(episodeId).catch(() => undefined)
    if (cached && Date.now() - cached.cachedAt < 21600000) {
      comments.value = cached.comments
      toast(t('cachedComments', { count: comments.value.length }))
      return
    }
    const result = await getComments(episodeId)
    comments.value = parseComments(result.comments || [])
    await cacheComments(episodeId, comments.value)
    toast(t('loadedComments', { count: comments.value.length }))
  } catch (exception) {
    error.value = exception instanceof Error ? exception.message : t('danmakuLoadingFailed')
  } finally {
    commentsLoading.value = false
  }
}

async function search() {
  if (keyword.value.trim().length < 2) {
    error.value = t('searchMin')
    return
  }
  loading.value = true
  try {
    searchResults.value = (await searchEpisodes(keyword.value.trim())).animes || []
  } catch (exception) {
    error.value = exception instanceof Error ? exception.message : t('searchFailed')
  } finally {
    loading.value = false
  }
}

async function chooseEpisode(anime: SearchAnime, episode: SearchAnime['episodes'][number]) {
  await select({ episodeId: episode.episodeId, animeId: anime.animeId, animeTitle: anime.animeTitle, episodeTitle: episode.episodeTitle, shift: 0 })
  showSearch.value = false
}

function toggle() {
  if (!video.value || !file.value) return
  video.value.paused ? video.value.play().catch(() => {}) : video.value.pause()
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

function update() {
  currentTime.value = video.value?.currentTime || 0
  if (fileKey.value && file.value) {
    saveRecord({ key: fileKey.value, fileName: file.value.name, fileSize: file.value.size, currentTime: currentTime.value, duration: duration.value, episodeId: selected.value?.episodeId, animeTitle: selected.value?.animeTitle, episodeTitle: selected.value?.episodeTitle, updatedAt: Date.now() })
  }
}

function drop(event: DragEvent) {
  event.preventDefault()
  choose(event.dataTransfer?.files?.[0])
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (showSettings.value) showSettings.value = false
    if (webFullscreen.value) toggleWebFullscreen()
    if (document.fullscreenElement) void document.exitFullscreen()
    return
  }
  if (showSettings.value) return
  const target = event.target as HTMLElement | null
  if (target && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) return
  if (!file.value || event.ctrlKey || event.altKey || event.metaKey) return

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
      settings.danmakuEnabled = !settings.danmakuEnabled
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
  document.removeEventListener('fullscreenchange', syncNativeFullscreen)
  document.body.style.overflow = ''
  clearTimeout(timer)
})
</script>

<template>
  <main class="app" @dragover.prevent @drop="drop">
    <header>
      <div class="brand"><b>弹</b><span>{{ t('localDanmuPlayer') }}<small>{{ t('localVideoLocalData') }}</small></span></div>
      <div class="header-actions">
        <i :class="{ live: !demoMode }">{{ demoMode ? t('demoMode') : t('apiConnected') }}</i>
        <select v-model="settings.language" class="language-select" :aria-label="t('language')" @change="applyLanguage">
          <option v-for="option in languageOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
        <button :aria-label="t('playerSettings')" @click="showSettings = true">⚙</button>
      </div>
    </header>

    <section class="layout">
      <div class="player">
        <div v-if="!file" class="drop" @click="input?.click()">
          <strong>▶</strong><h1>{{ t('openLocalVideo') }}</h1><p>{{ t('dropVideoHere') }}</p><small>{{ t('videoReadLocally') }}</small>
          <button class="primary" @click.stop="input?.click()">{{ t('chooseVideo') }}</button>
        </div>
        <div v-else ref="frame" class="frame" :class="{ 'web-fullscreen': webFullscreen }" @mouseenter="revealControls" @mousemove="revealControls" @mouseleave="hideControls">
          <video ref="video" :src="url" @loadedmetadata="metadata" @timeupdate="update" @play="playing = true" @pause="playing = false" @ended="playing = false" @ratechange="syncPlaybackRate" @click="toggle" />
          <SubtitleOverlay :cues="subtitles" :current-time="currentTime" :enabled="subtitleEnabled" />
          <DanmakuOverlay :comments="comments" :current-time="currentTime" :playing="playing" :playback-rate="playbackRate" :enabled="settings.danmakuEnabled" :opacity="settings.opacity" :font-size="settings.fontSize" :speed="settings.speed" :area="settings.danmakuArea" />
          <button v-if="!playing && !currentTime" class="bigplay" @click="toggle">▶</button>
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
                <button class="control-icon volume-button" :aria-label="muted || volume === 0 ? t('unmute') : t('mute')" :title="muted || volume === 0 ? t('unmute') : t('mute')" @click="toggleMute">{{ muted || volume === 0 ? '🔇' : '🔊' }}</button>
                <input class="volume-slider" type="range" min="0" max="1" step=".01" :value="muted ? 0 : volume" :aria-label="t('volume')" @input="changeVolume" />
                <button class="control-icon toolbar-button" :aria-label="t('playerSettings')" :title="t('playerSettings')" @click="showSettings = true">⚙</button>
                <button class="control-icon text-control" :class="{ active: subtitleEnabled }" :disabled="subtitleLoading" :title="subtitles.length ? (subtitleEnabled ? t('subtitleOff') : t('subtitleOn')) : t('loadSubtitle')" @click="subtitles.length ? subtitleEnabled = !subtitleEnabled : loadEmbeddedSubtitles()">CC</button>
                <button class="control-icon text-control" :class="{ active: settings.danmakuEnabled }" :title="settings.danmakuEnabled ? t('danmakuShort') : t('danmakuOff')" @click="settings.danmakuEnabled = !settings.danmakuEnabled">弹</button>
                <button class="control-icon toolbar-button" :title="webFullscreen ? t('exitWebFullscreen') : t('webFullscreen')" @click="toggleWebFullscreen">↗</button>
                <button class="control-icon toolbar-button" :title="nativeFullscreen ? t('exitFullscreen') : t('fullscreen')" @click="toggleNativeFullscreen">⛶</button>
              </div>
            </div>
          </div>
        </div>
        <div class="now"><div><small>{{ t('nowPlaying') }}</small><h2>{{ title }}</h2></div><button @click="input?.click()">{{ t('changeVideo') }}</button></div>
        <input ref="input" hidden type="file" accept="video/*,.mkv,.avi,.mov,.m4v,.ts" @change="choose(($event.target as HTMLInputElement).files?.[0])" />
      </div>

      <aside>
        <div class="card status"><b><span :class="{ active: !demoMode }" /> {{ demoMode ? t('credentialsRequired') : t('danmakuServiceReady') }}</b><p>{{ demoMode ? t('demoCommentsShown') : t('secureProxy') }}</p></div>
        <div class="card"><h3>{{ t('matchResult') }} <small v-if="loading">{{ t('working') }}</small></h3><div v-if="matches.length" class="list"><button v-for="match in matches" :key="match.episodeId" :class="{ selected: selected?.episodeId === match.episodeId }" @click="select(match)"><b>{{ match.animeTitle }}</b><small>{{ match.episodeTitle || t('episode', { number: '?' }) }}</small></button></div><p v-else class="muted">{{ t('matchingHint') }}</p><button class="outline full" @click="showSearch = !showSearch">{{ t('manualSearch') }}</button></div>
        <div v-if="showSearch" class="card"><div class="search"><input v-model="keyword" :placeholder="t('animeTitle')" @keyup.enter="search" /><button class="primary" @click="search">{{ t('search') }}</button></div><div v-for="anime in searchResults" :key="anime.animeId" class="result"><b>{{ anime.animeTitle }}</b><button v-for="episode in anime.episodes" :key="episode.episodeId" @click="chooseEpisode(anime, episode)">{{ episode.episodeTitle || t('select') }}</button></div></div>
        <div class="card info"><h3>{{ t('localData') }}</h3><p><span>{{ t('danmaku') }}</span><b>{{ commentsLoading ? t('loading') : t('comments', { count: comments.length }) }}</b></p><p><span>{{ t('videoProcessing') }}</span><b>{{ t('local') }}</b></p><p><span>{{ t('playbackHistory') }}</span><b>{{ t('browserStorage') }}</b></p></div>
      </aside>
    </section>

    <footer>{{ t('localVideo') }} · {{ t('localProcessing') }} · {{ t('localCache') }}</footer>
    <div v-if="notice" class="toast">{{ notice }}</div>
    <div v-if="error" class="toast err">{{ error }} <button @click="error = ''">×</button></div>
    <div v-if="showSettings" class="backdrop" @click.self="showSettings = false"><section class="modal"><h2>{{ t('playerSettings') }} <button @click="showSettings = false">×</button></h2><label>{{ t('language') }}<select v-model="settings.language" class="settings-select" @change="applyLanguage"><option v-for="option in languageOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></label><label><input v-model="settings.danmakuEnabled" type="checkbox" /> {{ t('showDanmaku') }}</label><label>{{ t('opacity') }} <output>{{ Math.round(settings.opacity * 100) }}%</output><input v-model.number="settings.opacity" type="range" min=".2" max="1" step=".05" /></label><label>{{ t('fontSize') }} <output>{{ settings.fontSize }}px</output><input v-model.number="settings.fontSize" type="range" min="16" max="42" /></label><label>{{ t('danmakuArea') }}<select v-model.number="settings.danmakuArea" class="settings-select"><option :value="25">{{ t('areaQuarter') }}</option><option :value="50">{{ t('areaHalf') }}</option><option :value="75">{{ t('areaThreeQuarters') }}</option><option :value="100">{{ t('areaFull') }}</option></select></label><label>{{ t('scrollSpeed') }} <output>{{ settings.speed }} {{ t('secondsShort') }}</output><input v-model.number="settings.speed" type="range" min="2" max="16" step="1" /></label><label>{{ t('skipSeconds') }} <output>{{ settings.skipSeconds }} {{ t('secondsShort') }}</output><input v-model.number="settings.skipSeconds" type="number" min="0" max="600" step="5" /></label><p class="shortcut-help">{{ t('shortcutHelp') }}</p><button class="primary full" @click="save">{{ t('saveSettings') }}</button></section></div>
  </main>
</template>
