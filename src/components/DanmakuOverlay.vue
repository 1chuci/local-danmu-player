<script setup lang="ts">
import Danmaku from '@ironkinoko/danmaku'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { DanmakuComment } from '../types'

const props = defineProps<{
  comments: DanmakuComment[]
  media?: HTMLVideoElement
  enabled: boolean
  opacity: number
  fontSize: number
  speed: number
  area: number
}>()

const container = ref<HTMLElement>()
let engine: Danmaku | undefined
let resizeObserver: ResizeObserver | undefined
let mounted = false

function engineComments() {
  return props.comments.map((comment) => ({
    text: comment.text,
    time: comment.time,
    mode: 'rtl' as const,
    style: { color: comment.color, fontSize: String(props.fontSize) + 'px', fontWeight: '700', textShadow: '1px 1px 2px #000, -1px -1px 2px #000' },
  }))
}

function syncEngine() {
  if (!engine || !container.value) return
  engine.opacity = props.opacity
  const area = Math.max(0.25, Math.min(1, props.area / 100))
  if (engine.scrollAreaPercent !== area) engine.scrollAreaPercent = area
  // The engine already scales transitions with media.playbackRate.
  engine.resize()
  engine.speed = Math.max(1, container.value.clientWidth / Math.max(2, props.speed))
  if (props.enabled) engine.show()
  else engine.hide()
}

function bindMedia() {
  engine?.destroy()
  engine = undefined
  if (!mounted || !container.value || !props.media) return
  engine = new Danmaku({
    container: container.value,
    media: props.media,
    comments: engineComments(),
    opacity: props.opacity,
    overlap: false,
    scrollAreaPercent: Math.max(0.25, Math.min(1, props.area / 100)),
  })
  syncEngine()
}

watch(() => props.media, bindMedia, { flush: 'post' })
watch(() => [props.comments, props.fontSize], () => engine?.reload(engineComments()), { deep: true })
watch(() => [props.enabled, props.opacity, props.speed, props.area], syncEngine, { flush: 'post' })

onMounted(() => {
  mounted = true
  bindMedia()
  resizeObserver = new ResizeObserver(syncEngine)
  if (container.value) resizeObserver.observe(container.value)
})

onBeforeUnmount(() => {
  mounted = false
  resizeObserver?.disconnect()
  engine?.destroy()
  engine = undefined
})
</script>

<template>
  <div ref="container" v-show="enabled" class="danmaku-overlay" aria-hidden="true" />
</template>
