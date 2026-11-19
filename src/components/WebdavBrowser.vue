<script setup lang="ts">
import { onMounted, reactive } from 'vue'
import { useWebdav } from '../composables/useWebdav'
import { isVideoName } from '../lib/localFiles'
import AppIcon from './AppIcon.vue'
import type { WebdavEntry } from '../types'

const props = defineProps<{ t: (key: string, params?: Record<string, string | number>) => string }>()
const emit = defineEmits<{ close: []; play: [entry: WebdavEntry, token: string, playlist: WebdavEntry[]] }>()

const { config, configured, token, checked, connecting, loading, error, entries, breadcrumb, canGoUp, check, connect, disconnect, load, enter, goUp, refresh } = useWebdav({ t: props.t })

const form = reactive({
  url: config.value?.url ?? '',
  username: config.value?.username ?? '',
  password: '',
})

function formatSize(bytes: number) {
  if (!bytes) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1 }
  return `${value >= 100 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`
}

async function submit() {
  await connect({ url: form.url.trim(), username: form.username, password: form.password })
}

function play(entry: WebdavEntry) {
  const playlist = entries.value.filter((item) => !item.isDirectory && isVideoName(item.name))
  emit('play', entry, token.value, playlist)
}

function disconnectAndReset() {
  disconnect()
  form.password = ''
}

onMounted(async () => {
  await check()
  if (configured.value) await load()
})
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <section class="modal webdav-modal">
      <h2>{{ t('webdavTitle') }} <button :aria-label="t('close')" @click="emit('close')"><AppIcon name="close" /></button></h2>

      <template v-if="!checked || connecting">
        <p class="muted">{{ t('loading') }}</p>
      </template>

      <form v-else-if="!configured" class="webdav-form" @submit.prevent="submit">
        <label>
          <span>{{ t('webdavUrl') }}</span>
          <input v-model="form.url" type="text" placeholder="https://dav.jianguoyun.com/dav/" autocomplete="off" spellcheck="false" />
        </label>
        <label>
          <span>{{ t('webdavUsername') }}</span>
          <input v-model="form.username" type="text" autocomplete="off" spellcheck="false" />
        </label>
        <label>
          <span>{{ t('webdavPassword') }}</span>
          <input v-model="form.password" type="password" autocomplete="off" />
        </label>
        <p v-if="error" class="webdav-error">{{ error }}</p>
        <button class="primary" type="submit" :disabled="!form.url.trim()">{{ t('webdavConnect') }}</button>
        <p class="shortcut-help">{{ t('webdavPrivacyHint') }}</p>
      </form>

      <template v-else>
        <div class="webdav-nav">
          <button class="outline" :disabled="!canGoUp" :aria-label="t('webdavUp')" @click="goUp"><AppIcon name="up" />{{ t('webdavUp') }}</button>
          <span class="webdav-path">{{ breadcrumb }}</span>
          <button class="outline" :aria-label="t('webdavRefresh')" @click="refresh"><AppIcon name="refresh" />{{ t('webdavRefresh') }}</button>
          <button class="outline" @click="disconnectAndReset">{{ t('webdavDisconnect') }}</button>
        </div>
        <p v-if="loading" class="muted">{{ t('loading') }}</p>
        <p v-if="error" class="webdav-error">{{ error }}</p>
        <div v-if="entries.length" class="list webdav-list">
          <button v-for="entry in entries" :key="entry.path" @click="entry.isDirectory ? enter(entry) : play(entry)">
            <AppIcon :name="entry.isDirectory ? 'folder' : 'video'" />
            <b>{{ entry.name }}</b>
            <small v-if="!entry.isDirectory">{{ formatSize(entry.size) }}</small>
          </button>
        </div>
        <p v-else-if="!error && !loading" class="muted">{{ t('webdavEmpty') }}</p>
        <p class="shortcut-help">{{ t('webdavHint') }}</p>
      </template>
    </section>
  </div>
</template>

<style scoped>
.webdav-modal{width:min(560px,100%)}
.webdav-modal h2{gap:12px}
.webdav-modal h2 button{flex:0 0 auto}
.webdav-modal h2 .app-icon{width:17px;height:17px}
.webdav-form{display:flex;flex-direction:column;gap:9px;margin-bottom:4px}
.webdav-form label{display:flex;flex-direction:column;gap:6px;color:#aab5c1;font-size:11px}
.webdav-form input{width:100%;min-height:42px;padding:0 11px;font-size:13px}
.webdav-form .primary{min-height:42px;margin-top:5px;border-radius:6px}
.webdav-form .shortcut-help{margin:4px 0 0;color:#8996a3;font-size:10px}
.webdav-nav{display:flex;align-items:center;gap:7px;margin-bottom:12px}
.webdav-nav .outline{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:36px;padding:0 10px;border-radius:6px;font-size:10px}
.webdav-nav .app-icon{width:14px;height:14px}
.webdav-nav .outline:disabled{opacity:.45;cursor:default}
.webdav-path{flex:1;min-width:0;overflow:hidden;padding:0 3px;color:#93a0ad;font:10px/1.5 ui-monospace,monospace;text-overflow:ellipsis;white-space:nowrap}
.webdav-list{max-height:min(52vh,520px);gap:4px;margin:0;padding:2px 4px 2px 1px}
.webdav-list button{display:grid;grid-template-columns:17px minmax(0,1fr) auto;align-items:center;gap:9px;min-height:46px;padding:7px 10px;border:1px solid transparent;border-radius:6px;background:transparent}
.webdav-list button:hover,.webdav-list button:focus-visible{border-color:#32433f;background:#18231f}
.webdav-list button .app-icon{width:16px;height:16px;color:#85d9ba}
.webdav-list button b{min-width:0;overflow-wrap:anywhere;color:#d6dee7;font-size:11px;font-weight:520;line-height:1.4}
.webdav-list button small{color:#92a0ac;font-size:9px;white-space:nowrap}
.webdav-error{margin:0 0 10px;color:#ffb9b9;font-size:11px;line-height:1.5}
@media(max-width:560px){.webdav-modal{padding:16px}.webdav-nav{flex-wrap:wrap;gap:5px}.webdav-nav .outline{min-height:38px;padding:0 8px}.webdav-path{order:2;flex-basis:100%;padding:4px 2px}.webdav-list{max-height:48dvh}.webdav-list button{min-height:48px}}
</style>
