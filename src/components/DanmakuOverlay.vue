<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { DanmakuComment } from '../types'

interface ActiveComment extends DanmakuComment {
  key: string
  lane: number
  laneGroup: LaneGroup
  expiresAt: number
}

type LaneGroup = 'scroll' | 'fixed' | 'bottom'

const LANE_COUNT = 10

const props = defineProps<{
  comments: DanmakuComment[]
  currentTime: number
  playing: boolean
  enabled: boolean
  opacity: number
  fontSize: number
  speed: number
  area: number
}>()

const active = ref<ActiveComment[]>([])
const overlay = ref<HTMLElement>()
const overlayHeight = ref(500)
let previousTime = 0
let sequence = 0
const laneCursors: Record<LaneGroup, number> = { scroll: 0, fixed: 0, bottom: 0 }

const overlayStyle = computed(() => ({
  '--danmaku-opacity': String(props.opacity),
  '--danmaku-size': `${props.fontSize}px`,
  '--danmaku-speed': `${props.speed}s`,
}))

const laneCount = computed(() => {
  const availableHeight = overlayHeight.value * props.area / 100
  const laneHeight = Math.max(props.fontSize * 1.35, 24)
  return Math.max(1, Math.min(LANE_COUNT, Math.floor(availableHeight / laneHeight)))
})

function laneTop(lane: number) {
  const step = Math.max(1, props.area - 6) / Math.max(1, laneCount.value - 1)
  return `${Math.min(props.area - 3, 3 + lane * step)}%`
}

function laneGroup(mode: number): LaneGroup {
  if (mode === 4) return 'bottom'
  if (mode === 5) return 'fixed'
  return 'scroll'
}

function nextLane(group: LaneGroup) {
  const start = laneCursors[group]
  for (let offset = 0; offset < laneCount.value; offset += 1) {
    const lane = (start + offset) % laneCount.value
    const occupied = active.value.some((entry) => entry.laneGroup === group && entry.lane === lane)
    if (!occupied) {
      laneCursors[group] = (lane + 1) % laneCount.value
      return lane
    }
  }
  return undefined
}

function commentStyle(comment: ActiveComment) {
  const animationPlayState = props.playing && props.enabled ? 'running' : 'paused'
  if (comment.laneGroup === 'bottom') {
    const step = Math.max(1, props.area - 6) / Math.max(1, laneCount.value - 1)
    return { color: comment.color, bottom: `${Math.min(props.area - 3, 3 + comment.lane * step)}%`, animationPlayState }
  }
  return { color: comment.color, top: laneTop(comment.lane), animationPlayState }
}

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

    active.value = active.value.filter((entry) => entry.expiresAt > currentTime)
    const incoming = props.comments.filter(
      (comment) => comment.time > previousTime && comment.time <= currentTime,
    )
    for (const comment of incoming.slice(0, 12)) {
      const group = laneGroup(comment.mode)
      const lane = nextLane(group)
      if (lane === undefined) continue
      const item = {
        ...comment,
        key: `${comment.id}-${sequence++}`,
        lane,
        laneGroup: group,
        expiresAt: currentTime + Math.max(props.speed, 2) + 0.5,
      }
      active.value.push(item)
    }
    previousTime = currentTime
  },
)

let resizeObserver: ResizeObserver | undefined

onMounted(() => {
  if (!overlay.value) return
  const updateHeight = () => { overlayHeight.value = overlay.value?.clientHeight || 500 }
  resizeObserver = new ResizeObserver(updateHeight)
  resizeObserver.observe(overlay.value)
  updateHeight()
})

onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<template>
  <div ref="overlay" v-show="enabled" class="danmaku-overlay" :style="overlayStyle" aria-hidden="true">
    <span
      v-for="comment in active"
      :key="comment.key"
      class="danmaku-item"
      :class="{ fixed: comment.mode === 4 || comment.mode === 5, bottom: comment.mode === 4 }"
      :style="commentStyle(comment)"
    >{{ comment.text }}</span>
  </div>
</template>
