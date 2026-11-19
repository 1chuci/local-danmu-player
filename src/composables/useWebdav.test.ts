import { effectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, authorizeWebdav, listWebdav } from '../lib/api'
import { loadWebdavConfig, saveWebdavConfig, clearWebdavConfig } from '../lib/storage'
import type { WebdavConfig } from '../types'

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return { ...actual, authorizeWebdav: vi.fn(), listWebdav: vi.fn() }
})
vi.mock('../lib/storage', () => ({ loadWebdavConfig: vi.fn(), saveWebdavConfig: vi.fn(), clearWebdavConfig: vi.fn() }))

const config = { url: 'https://dav.example/dav/', username: 'user', password: 'secret' }
const listing = { path: '/dav', entries: [{ name: '01.mkv', path: '/dav/01.mkv', size: 10, isDirectory: false }] }
const scopes: ReturnType<typeof effectScope>[] = []
let create: typeof import('./useWebdav')['useWebdav']

function open() {
  const scope = effectScope()
  scopes.push(scope)
  return { scope, state: scope.run(() => create({ t: key => key }))! }
}

beforeEach(async () => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.mocked(loadWebdavConfig).mockReturnValue({ ...config })
  vi.mocked(authorizeWebdav).mockResolvedValue({ token: 'token-1', listing })
  vi.mocked(listWebdav).mockResolvedValue(listing)
  create = (await import('./useWebdav')).useWebdav
})
afterEach(() => { for (const scope of scopes.splice(0)) scope.stop(); vi.restoreAllMocks() })

describe('WebDAV connection request flow', () => {
  it('connects with one request and saves credentials only after success', async () => {
    const { state } = open()
    await state.connect(config)
    expect(authorizeWebdav).toHaveBeenCalledTimes(1)
    expect(listWebdav).not.toHaveBeenCalled()
    expect(state.entries.value).toEqual(listing.entries)
    expect(saveWebdavConfig).toHaveBeenCalledWith(config)
  })

  it('reuses the page token after reopening but fetches a fresh directory', async () => {
    const first = open()
    await first.state.load()
    first.scope.stop()
    const { state } = open()
    await state.load()
    expect(authorizeWebdav).toHaveBeenCalledTimes(1)
    expect(listWebdav).toHaveBeenCalledExactlyOnceWith('token-1', '')
    expect(state.entries.value).toEqual(listing.entries)
  })

  it('renews an expired token and keeps the requested subdirectory', async () => {
    await open().state.load()
    vi.mocked(listWebdav).mockRejectedValueOnce(new ApiError('expired', 401, 'WEBDAV_SESSION_EXPIRED'))
    vi.mocked(authorizeWebdav).mockResolvedValueOnce({ token: 'token-2', listing })
    const { state } = open()
    await state.load('/dav/anime')
    expect(authorizeWebdav).toHaveBeenCalledTimes(2)
    expect(listWebdav).toHaveBeenNthCalledWith(2, 'token-2', '/dav/anime')
    expect(state.error.value).toBe('')
  })

  it('does not retry upstream credential errors as expired sessions', async () => {
    await open().state.load()
    vi.mocked(listWebdav).mockRejectedValueOnce(new ApiError('wrong password', 401))
    const { state } = open()
    await state.load()
    expect(authorizeWebdav).toHaveBeenCalledTimes(1)
    expect(state.error.value).toBe('wrong password')
    expect(state.loading.value).toBe(false)
    await state.load()
    expect(state.entries.value).toEqual(listing.entries)
  })

  it('does not reuse tokens with changed credentials or after disconnect', async () => {
    const first = open()
    await first.state.load()
    vi.mocked(loadWebdavConfig).mockReturnValue({ ...config, password: 'new' })
    const second = open()
    await second.state.load()
    expect(authorizeWebdav).toHaveBeenCalledTimes(2)
    second.state.disconnect()
    expect(clearWebdavConfig).toHaveBeenCalledOnce()
    await open().state.load()
    expect(authorizeWebdav).toHaveBeenCalledTimes(3)
  })

  it('renews locally aged tokens before sending a listing request', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000)
    await open().state.load()
    clock.mockReturnValue(1000 + 24 * 60 * 60 * 1000)
    await open().state.load()
    expect(authorizeWebdav).toHaveBeenCalledTimes(2)
    expect(listWebdav).not.toHaveBeenCalled()
  })

  it('ignores late connection results after disconnect and keeps one active request', async () => {
    let finish!: (value: { token: string; listing: typeof listing }) => void
    vi.mocked(authorizeWebdav).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const { state } = open()
    const pending = state.connect(config)
    await state.load()
    await state.connect(config)
    expect(authorizeWebdav).toHaveBeenCalledTimes(1)
    state.disconnect()
    finish({ token: 'late', listing })
    await pending
    expect(state.token.value).toBe('')
    expect(state.entries.value).toEqual([])
    expect(saveWebdavConfig).not.toHaveBeenCalled()
    expect(state.connecting.value).toBe(false)
  })

  it('does not cache a connection that fails or completes after modal disposal', async () => {
    vi.mocked(authorizeWebdav).mockRejectedValueOnce(new Error('unavailable'))
    const failed = open()
    await failed.state.connect(config)
    expect(saveWebdavConfig).not.toHaveBeenCalled()
    expect(failed.state.error.value).toBe('unavailable')
    let finish!: (value: { token: string; listing: typeof listing }) => void
    vi.mocked(authorizeWebdav).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const next = open()
    const pending = next.state.load()
    next.scope.stop()
    finish({ token: 'late', listing })
    await pending
    await open().state.load()
    expect(authorizeWebdav).toHaveBeenCalledTimes(3)
  })
})
