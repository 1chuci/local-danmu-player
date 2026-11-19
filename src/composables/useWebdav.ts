import { computed, ref } from 'vue'
import { authorizeWebdav, listWebdav } from '../lib/api'
import { clearWebdavConfig, loadWebdavConfig, saveWebdavConfig } from '../lib/storage'
import type { WebdavConfig, WebdavEntry } from '../types'

interface WebdavDeps {
  t: (key: string, params?: Record<string, string | number>) => string
}

function basenameOf(path: string) {
  return path.replace(/\/+$/, '').split('/').filter(Boolean).pop() || ''
}

export function useWebdav(deps: WebdavDeps) {
  const config = ref<WebdavConfig | null>(loadWebdavConfig())
  const configured = computed(() => Boolean(config.value?.url))
  const token = ref('')
  const checked = ref(false)
  const connecting = ref(false)
  const loading = ref(false)
  const error = ref('')
  const path = ref('')
  const entries = ref<WebdavEntry[]>([])
  const stack = ref<Array<{ path: string; name: string }>>([])

  async function check() {
    if (checked.value) return
    checked.value = true
  }

  async function ensureToken() {
    if (token.value) return token.value
    if (!config.value) throw new Error(deps.t('webdavNotConfigured'))
    token.value = (await authorizeWebdav(config.value)).token
    return token.value
  }

  async function load(targetPath = '') {
    loading.value = true
    error.value = ''
    try {
      const currentToken = await ensureToken()
      const result = await listWebdav(currentToken, targetPath)
      path.value = result.path
      entries.value = result.entries
    } catch (exception) {
      entries.value = []
      error.value = exception instanceof Error ? exception.message : deps.t('webdavLoadFailed')
    } finally {
      loading.value = false
    }
  }

  async function connect(nextConfig: WebdavConfig) {
    connecting.value = true
    error.value = ''
    try {
      token.value = (await authorizeWebdav(nextConfig)).token
      const result = await listWebdav(token.value, '')
      path.value = result.path
      entries.value = result.entries
      saveWebdavConfig(nextConfig)
      config.value = { ...nextConfig }
    } catch (exception) {
      token.value = ''
      entries.value = []
      error.value = exception instanceof Error ? exception.message : deps.t('webdavLoadFailed')
    } finally {
      connecting.value = false
    }
  }

  function disconnect() {
    clearWebdavConfig()
    config.value = null
    token.value = ''
    entries.value = []
    path.value = ''
    stack.value = []
    error.value = ''
  }

  function enter(entry: WebdavEntry) {
    if (!entry.isDirectory) return
    stack.value.push({ path: path.value, name: currentName.value })
    void load(entry.path)
  }

  function goUp() {
    const parent = stack.value.pop()
    void load(parent?.path ?? '')
  }

  function refresh() {
    void load(path.value)
  }

  const currentName = computed(() => (stack.value.length ? basenameOf(path.value) : deps.t('webdavRoot')))
  const breadcrumb = computed(() => [...stack.value.map((item) => item.name), currentName.value].join(' / '))
  const canGoUp = computed(() => stack.value.length > 0)

  return {
    config,
    configured,
    token,
    checked,
    connecting,
    loading,
    error,
    path,
    entries,
    breadcrumb,
    canGoUp,
    check,
    connect,
    disconnect,
    load,
    enter,
    goUp,
    refresh,
  }
}
