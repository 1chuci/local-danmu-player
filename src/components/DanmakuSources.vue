<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { getBilibiliComments, getBilibiliVideo } from '../lib/api'
import { createSerialQueue } from '../lib/serialQueue'
import { MAX_DANMAKU_XML_BYTES, parseBilibiliInput, parseBilibiliXml } from '../lib/danmakuXml'
import type { DanmakuComment } from '../types'

const props = defineProps<{ sourceKey: string; language: string }>()
const emit = defineEmits<{ loaded: [comments: DanmakuComment[], label: string] }>()

const chinese = () => props.language.toLowerCase().startsWith('zh')
const labels = {
  title: () => chinese() ? 'Bilibili 弹幕' : 'Bilibili danmaku',
  placeholder: () => chinese() ? 'BV 号或 bilibili 视频链接' : 'BV id or Bilibili video URL',
  lookup: () => chinese() ? '获取弹幕' : 'Get danmaku',
  page: () => chinese() ? '分 P' : 'Page',
  local: () => chinese() ? '导入 XML' : 'Import XML',
  loading: () => chinese() ? '正在获取视频并加载弹幕…' : 'Getting video and loading danmaku…',
  empty: () => chinese() ? '没有找到有效弹幕' : 'No valid comments found',
  invalid: () => chinese() ? '请输入有效的 BV 号或 bilibili 视频链接' : 'Enter a valid BV id or Bilibili video URL',
  tooLarge: () => chinese() ? 'XML 文件不能超过 12 MB' : 'XML file must be 12 MB or smaller',
  invalidPage: () => chinese() ? '该视频不存在此分 P' : 'The requested video page does not exist',
  videoError: () => chinese() ? '无法读取视频信息' : 'Could not load video information',
  commentsError: () => chinese() ? '弹幕加载失败' : 'Failed to load danmaku',
  fileError: () => chinese() ? 'XML 文件读取失败' : 'Could not read XML file',
}

const input = ref('')
const video = ref<Awaited<ReturnType<typeof getBilibiliVideo>> | null>(null)
const selectedPage = ref(1)
const loading = ref(false)
const error = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
let requestId = 0
const serializeBilibiliRequest = createSerialQueue()

watch(() => props.sourceKey, () => {
  requestId += 1
  loading.value = false
  error.value = ''
  video.value = null
}, { flush: 'sync' })

async function findVideo() {
  if (loading.value) return
  const parsed = parseBilibiliInput(input.value)
  if (!parsed) { error.value = labels.invalid(); return }
  const id = ++requestId
  loading.value = true
  error.value = ''
  video.value = null
  try {
    const result = await serializeBilibiliRequest(() => getBilibiliVideo(parsed.bvid))
    if (id !== requestId) return
    if (!result.pages.some((page) => page.page === parsed.page)) {
      video.value = result
      error.value = labels.invalidPage()
      return
    }
    video.value = result
    selectedPage.value = parsed.page
    await fetchComments(result, parsed.page, id)
  } catch (exception) {
    if (id === requestId) error.value = exception instanceof Error ? exception.message : labels.videoError()
  } finally {
    if (id === requestId) loading.value = false
  }
}

async function fetchComments(sourceVideo: NonNullable<typeof video.value>, pageNumber: number, id: number) {
  try {
    const result = await serializeBilibiliRequest(() => id === requestId ? getBilibiliComments(sourceVideo.bvid, pageNumber) : Promise.resolve(null))
    if (!result || id !== requestId) return
    const comments = parseBilibiliXml(result.xml)
    if (!comments.length) { error.value = labels.empty(); return }
    const page = sourceVideo.pages.find((entry) => entry.page === pageNumber)
    emit('loaded', comments, [result.title || sourceVideo.title, page?.part].filter(Boolean).join(' - '))
  } catch (exception) {
    if (id === requestId) error.value = exception instanceof Error ? exception.message : labels.commentsError()
  }
}

async function loadComments() {
  const sourceVideo = video.value
  const pageNumber = selectedPage.value
  if (!sourceVideo?.pages.some((page) => page.page === pageNumber)) return
  const id = ++requestId
  loading.value = true
  error.value = ''
  try {
    await fetchComments(sourceVideo, pageNumber, id)
  } finally {
    if (id === requestId) loading.value = false
  }
}

async function loadLocalXml(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (file) await importXmlFile(file)
}

async function importXmlFile(file: File) {
  if (loading.value) return
  const id = ++requestId
  error.value = ''
  if (file.size > MAX_DANMAKU_XML_BYTES) { error.value = labels.tooLarge(); return }
  loading.value = true
  try {
    const comments = parseBilibiliXml(await file.text())
    if (id !== requestId) return
    if (!comments.length) { error.value = labels.empty(); return }
    emit('loaded', comments, file.name)
  } catch {
    if (id === requestId) error.value = labels.fileError()
  } finally {
    if (id === requestId) loading.value = false
  }
}

onBeforeUnmount(() => { requestId += 1 })
defineExpose({ importXmlFile })
</script>

<template>
  <section class="danmaku-sources" :aria-label="labels.title()">
    <h3>{{ labels.title() }}</h3>
    <form class="source-form" @submit.prevent="findVideo">
      <label class="sr-only" for="bilibili-input">{{ labels.placeholder() }}</label>
      <input id="bilibili-input" v-model="input" type="text" autocomplete="off" spellcheck="false" :placeholder="labels.placeholder()" :disabled="loading" />
      <button type="submit" :disabled="loading || !input.trim()">{{ labels.lookup() }}</button>
    </form>
    <div v-if="video?.pages.length" class="source-form page-form">
      <label for="bilibili-page">{{ labels.page() }}</label>
      <select id="bilibili-page" v-model.number="selectedPage" @change="loadComments">
        <option v-for="page in video.pages" :key="page.page" :value="page.page">{{ page.page }}. {{ page.part }}</option>
      </select>
    </div>
    <input ref="fileInput" class="sr-only" type="file" accept=".xml,application/xml,text/xml" @change="loadLocalXml" />
    <button class="local-button" type="button" :disabled="loading" @click="fileInput?.click()">{{ labels.local() }}</button>
    <p v-if="loading" class="source-status" role="status" aria-live="polite">{{ labels.loading() }}</p>
    <p v-else-if="error" class="source-error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.danmaku-sources{display:flex;flex-direction:column;gap:8px;width:100%;max-width:100%;min-width:0}
h3{margin:0;color:#d6dee7;font-size:12px;font-weight:600;line-height:1.4}
.source-form{display:flex;align-items:center;gap:7px;width:100%;min-width:0}
input[type=text],select{min-width:0;min-height:38px;padding:0 9px;border:1px solid #34423e;border-radius:5px;background:#111a18;color:#e2e9e6;font:inherit;font-size:11px}
.source-form input[type=text]{flex:1;width:100%}
button{flex:0 0 auto;min-height:36px;padding:0 10px;border:1px solid #42685a;border-radius:5px;background:#20352c;color:#d6efe2;font:inherit;font-size:10px;cursor:pointer}
button:hover:not(:disabled),button:focus-visible{border-color:#78b99c;background:#29463a;outline:none}
button:disabled{opacity:.55;cursor:default}
.page-form label{flex:0 0 auto;color:#aab5c1;font-size:10px}
.page-form select{flex:1}
.local-button{align-self:flex-start}
.source-status,.source-error{margin:0;font-size:10px;line-height:1.45;overflow-wrap:anywhere}
.source-status{color:#aab5c1}.source-error{color:#ffb9b9}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:420px){.source-form{flex-wrap:wrap}.source-form input[type=text]{flex-basis:100%}.page-form select{flex-basis:65%}}
</style>
