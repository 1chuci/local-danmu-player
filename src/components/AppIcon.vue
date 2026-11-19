<script setup lang="ts">
defineProps<{ name: keyof typeof paths }>()
const paths = {
  play: 'M9 5l11 7-11 7V5Z',
  video: 'M4 4h16v16H4z M4 8h16 M8 4v4 M16 4v4 M9 12l6 3-6 3z',
  folder: 'M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z',
  cloud: 'M20 16.5a4.5 4.5 0 0 0-4.5-4.5H15a6 6 0 0 0-11.6 2A3.5 3.5 0 0 0 4 21h11.5a4.5 4.5 0 0 0 4.5-4.5Z',
  settings: 'm10 3-1 3-3 1-3-1-1 3 2 2v3l-2 2 1 3 3-1 3 1 1 3h4l1-3 3-1 3 1 1-3-2-2v-3l2-2-1-3-3 1-3-1-1-3h-4Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  volume: 'M11 4 6 8H3v8h3l5 4V4Z M15 8a6 6 0 0 1 0 8 M18 5a10 10 0 0 1 0 14',
  volumeOff: 'M11 4 6 8H3v8h3l5 4V4Z m5 5 5 6 M21 9l-5 6',
  expand: 'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5',
  collapse: 'M9 4v5H4 M20 9h-5V4 M15 20v-5h5 M4 15h5v5',
  window: 'M3 4h18v16H3Z M3 8h18',
  close: 'm6 6 12 12 M18 6 6 18',
  up: 'm5 12 7-7 7 7 M12 5v15',
  refresh: 'M20 7v5h-5 M4 17v-5h5 M5 8a8 8 0 0 1 13-3l2 3 M4 16l2 3a8 8 0 0 0 13-3',
  arrow: 'm9 5 7 7-7 7',
  check: 'm5 12 4 4L19 6',
  subtitles: 'M3 5h18v14H3z M7 11h3 M14 11h3 M7 15h10',
  shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z m-4 9 3 3 5-6',
  search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6',
} as const
</script>

<template>
  <svg class="app-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path :d="paths[name]" /></svg>
</template>
