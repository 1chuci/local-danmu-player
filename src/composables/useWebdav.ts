import { computed, onScopeDispose, ref } from 'vue'
import { ApiError, authorizeWebdav, listWebdav } from '../lib/api'
import { clearWebdavConfig, loadWebdavConfig, saveWebdavConfig } from '../lib/storage'
import type { WebdavConfig, WebdavEntry, WebdavListing } from '../types'

interface WebdavDeps {
  t: (key: string, params?: Record<string, string | number>) => string
}

// Reuse only within this page; listings are always fetched again on opening.
const SESSION_REUSE_MS = 23 * 60 * 60 * 1000
let session: { config: WebdavConfig; token: string; expiresAt: number } | null = null

function reusableToken(config: WebdavConfig | null) {
  return config && session && session.expiresAt > Date.now()
    && config.url === session.config.url
    && config.username === session.config.username
    && config.password === session.config.password ? session.token : ''
}

function basenameOf(path: string) {
  return path.replace(/\/+$/, '').split('/').filter(Boolean).pop() || ''
}

export function useWebdav(deps: WebdavDeps) {
  const config = ref<WebdavConfig | null>(loadWebdavConfig())
  const configured = computed(() => Boolean(config.value?.url))
  const token = ref(reusableToken(config.value))
  const checked = ref(false)
  const connecting = ref(false)
  const loading = ref(false)
  const error = ref('')
  const path = ref('')
  const entries = ref<WebdavEntry[]>([])
  const stack = ref<Array<{ path: string; name: string }>>([])
  let requestId = 0
  let disposed = false
  onScopeDispose(() => { disposed = true; requestId += 1 })

  function current(id: number) { return !disposed && id === requestId }

  async function check() {
    checked.value = true
  }

  function remember(nextConfig: WebdavConfig, nextToken: string) {
    token.value = nextToken
    session = { config: { ...nextConfig }, token: nextToken, expiresAt: Date.now() + SESSION_REUSE_MS }
  }

  async function authorizeAndList(nextConfig: WebdavConfig, targetPath: string, id: number): Promise<WebdavListing> {
    const result = await authorizeWebdav(nextConfig)
    if (!current(id)) return result.listing
    remember(nextConfig, result.token)
    return targetPath && targetPath !== result.listing.path
      ? listWebdav(result.token, targetPath) : result.listing
  }

  async function load(targetPath = '') {
    if (disposed || loading.value || connecting.value) return
    const id = ++requestId
    loading.value = true
    error.value = ''
    try {
      if (!config.value) throw new Error(deps.t('webdavNotConfigured'))
      const activeConfig = { ...config.value }
      const cachedToken = reusableToken(activeConfig)
      let result: WebdavListing
      if (cachedToken) {
        token.value = cachedToken
        try {
          result = await listWebdav(cachedToken, targetPath)
        } catch (exception) {
          if (!(exception instanceof ApiError) || exception.code !== 'WEBDAV_SESSION_EXPIRED') throw exception
          if (!current(id)) return
          session = null
          token.value = ''
          result = await authorizeAndList(activeConfig, targetPath, id)
        }
      } else {
        result = await authorizeAndList(activeConfig, targetPath, id)
      }
      if (!current(id)) return
      path.value = result.path
      entries.value = result.entries
    } catch (exception) {
      if (!current(id)) return
      entries.value = []
      error.value = exception instanceof Error ? exception.message : deps.t('webdavLoadFailed')
    } finally {
      loading.value = false
    }
  }

  async function connect(nextConfig: WebdavConfig) {
    if (disposed || connecting.value || loading.value) return
    const id = ++requestId
    const activeConfig = { ...nextConfig }
    connecting.value = true
    error.value = ''
    try {
      const result = await authorizeWebdav(activeConfig)
      if (!current(id)) return
      saveWebdavConfig(activeConfig)
      remember(activeConfig, result.token)
      path.value = result.listing.path
      entries.value = result.listing.entries
      stack.value = []
      config.value = activeConfig
    } catch (exception) {
      if (!current(id)) return
      session = null
      token.value = ''
      entries.value = []
      error.value = exception instanceof Error ? exception.message : deps.t('webdavLoadFailed')
    } finally {
      connecting.value = false
    }
  }

  function disconnect() {
    requestId += 1
    session = null
    clearWebdavConfig()
    config.value = null
    token.value = ''
    entries.value = []
    path.value = ''
    stack.value = []
    error.value = ''
  }

  function enter(entry: WebdavEntry) {
    if (!entry.isDirectory || loading.value || connecting.value) return
    stack.value.push({ path: path.value, name: currentName.value })
    void load(entry.path)
  }

  function goUp() {
    if (loading.value || connecting.value) return
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
    config, configured, token, checked, connecting, loading, error, path, entries,
    breadcrumb, canGoUp, check, connect, disconnect, load, enter, goUp, refresh,
  }
}
