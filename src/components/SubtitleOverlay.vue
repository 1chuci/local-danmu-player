<script setup lang="ts">
import { computed } from 'vue'
import type { SubtitleCue } from '../lib/subtitles'

const props = defineProps<{
  cues: SubtitleCue[]
  currentTime: number
  enabled: boolean
}>()

const currentCue = computed(() => {
  const cues = props.cues
  if (!cues.length) return undefined
  const time = props.currentTime
  let low = 0
  let high = cues.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (cues[mid].start <= time) low = mid + 1
    else high = mid
  }
  const cue = cues[low - 1]
  return cue && time >= cue.start && time < cue.end ? cue : undefined
})
</script>

<template>
  <div v-if="enabled && currentCue" class="subtitle-overlay" aria-live="polite">{{ currentCue.text }}</div>
</template>
