<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { DanmakuComment } from '../types'

interface ActiveComment extends DanmakuComment {
  key: string
  lane: number
}

const props = defineProps<{
  comments: DanmakuComment[]
  currentTime: number
  playing: boolean
  enabled: boolean
  opacity: number
  fontSize: number
  speed: number
}>()

const active = ref<ActiveComment[]>([])
let previousTime = 0
let sequence = 0
let laneCursor = 0

const overlayStyle = computed(() => ({
  '--danmaku-opacity': String(props.opacity),
  '--danmaku-size': `${props.fontSize}px`,
  '--danmaku-speed': `${props.speed}s`,
}))

watch(
  () => props.comments,
  () => {
    active.value = []
    previousTime = props.currentTime
  },
)

watch(
  () => props.currentTime,
  (currentTime) => {
    if (!props.enabled || !props.playing) {
      previousTime = currentTime
      return
    }
    if (currentTime < previousTime || currentTime - previousTime > 2) {
      active.value = []
      previousTime = currentTime
      return
    }

    const incoming = props.comments.filter(
      (comment) => comment.time > previousTime && comment.time <= currentTime,
    )
    for (const comment of incoming.slice(0, 12)) {
      const item = { ...comment, key: `${comment.id}-${sequence++}`, lane: laneCursor++ % 8 }
      active.value.push(item)
      window.setTimeout(() => {
        active.value = active.value.filter((entry) => entry.key !== item.key)
      }, Math.max(props.speed, 2) * 1000 + 500)
    }
    previousTime = currentTime
  },
)
</script>

<template>
  <div v-show="enabled" class="danmaku-overlay" :style="overlayStyle" aria-hidden="true">
    <span
      v-for="comment in active"
      :key="comment.key"
      class="danmaku-item"
      :class="{ fixed: comment.mode === 4 || comment.mode === 5, bottom: comment.mode === 4 }"
      :style="{
        color: comment.color,
        top: comment.mode === 1 ? `${comment.lane * 11 + 3}%` : undefined,
      }"
    >{{ comment.text }}</span>
  </div>
</template>
