<script setup lang="ts">
import { computed } from 'vue'
import type { SubtitleCue } from '../lib/subtitles'

const props = defineProps<{
  cues: SubtitleCue[]
  currentTime: number
  enabled: boolean
}>()

const currentCue = computed(() => props.cues.find((cue) => props.currentTime >= cue.start && props.currentTime < cue.end))
</script>

<template>
  <div v-if="enabled && currentCue" class="subtitle-overlay" aria-live="polite">{{ currentCue.text }}</div>
</template>
