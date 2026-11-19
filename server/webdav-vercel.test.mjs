import http from 'node:http'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const servers = []
let api
let coldApi
let upstream
let createApp
const credentials = { username: 'webdav-user', password: 'webdav-password' }
const expectedAuth = 'Basic ' + Buffer.from(credentials.username + ':' + credentials.password).toString('base64')
const subtitle = '[Events]\nFormat: Start, End, Text\nDialogue: 0:00:01.00,0:00:02.00,字幕验证'
const upstreamRequests = []

async function listen(handler) {
  const server = http.createServer(handler)
  servers.push(server)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return `http://127.0.0.1:${server.address().port}`
}

beforeAll(async () => {
  vi.stubEnv('WEBDAV_SESSION_SECRET', 'integration-test-secret')
  const { default: handler } = await import('../api/webdav/[action].mjs')
  ;({ createApp } = await import('./app.mjs'))
  upstream = await listen((request, response) => {
    upstreamRequests.push({ method: request.method, url: request.url, range: request.headers.range, authorization: request.headers.authorization })
    if (request.headers.authorization !== expectedAuth) { response.writeHead(401).end(); return }
    if (request.method === 'PROPFIND') {
      response.writeHead(207, { 'Content-Type': 'application/xml' }).end(
        '<D:multistatus xmlns:D="DAV:">' +
        '<D:response><D:href>/dav/</D:href><D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop></D:propstat></D:response>' +
        '<D:response><D:href>/dav/Episode01.mkv</D:href><D:propstat><D:prop><D:getcontentlength>16</D:getcontentlength><D:resourcetype/></D:prop></D:propstat></D:response>' +
        '<D:response><D:href>/dav/Episode01.zh.ass</D:href><D:propstat><D:prop><D:getcontentlength>100</D:getcontentlength><D:resourcetype/></D:prop></D:propstat></D:response>' +
        '</D:multistatus>')
    } else if (request.url.endsWith('.ass')) {
      response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end(subtitle)
    } else if (request.headers.range === 'bytes=4-7') {
      response.writeHead(206, { 'Content-Type': 'video/x-matroska', 'Content-Length': '4', 'Content-Range': 'bytes 4-7/16' }).end('4567')
    } else response.writeHead(404).end()
  })
  api = await listen((request, response) => {
    const url = new URL(request.url, 'http://test')
    if (url.pathname === '/function') {
      // Emulate Vercel providing the dynamic path parameter separately.
      request.query = Object.fromEntries(url.searchParams)
    }
    handler(request, response)
  })
  coldApi = await listen(createApp())
})

afterAll(async () => {
  for (const server of servers) {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
  vi.unstubAllEnvs()
})

async function authorize() {
  const response = await fetch(api + '/api/webdav/authorize', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: upstream + '/dav/', ...credentials }),
  })
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  return (await response.json()).token
}

describe('deployed WebDAV function entry', () => {
  it('routes authorize validation and all protected actions instead of returning platform 404', async () => {
    const bad = await fetch(api + '/api/webdav/authorize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    expect(bad.status).toBe(400)
    expect(await bad.json()).toHaveProperty('message', '缺少 WebDAV 地址')
    for (const action of ['list', 'stream', 'subtitle-tracks', 'subtitle', 'subtitle-files', 'subtitle-file']) {
      const response = await fetch(api + '/api/webdav/' + action)
      expect(response.status).toBe(401)
      expect(await response.json()).toHaveProperty('code', 'WEBDAV_SESSION_EXPIRED')
    }
    const match = await fetch(api + '/api/webdav/match', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    expect(match.status).toBe(400)
  })

  it('lists an authenticated directory through a Vercel dynamic parameter and across a cold instance', async () => {
    const token = await authorize()
    const query = new URLSearchParams({ action: 'list', token, path: '/dav' })
    const response = await fetch(api + '/function?' + query)
    expect(response.status).toBe(200)
    expect((await response.json()).entries.map(entry => entry.name)).toEqual(['Episode01.mkv', 'Episode01.zh.ass'])
    const cold = await fetch(coldApi + '/api/webdav/list?' + new URLSearchParams({ token, path: '/dav' }))
    expect(cold.status).toBe(200)
    expect((await cold.json()).entries).toHaveLength(2)
    expect(upstreamRequests.at(-1)).toMatchObject({ method: 'PROPFIND', url: '/dav/', authorization: expectedAuth })
  })

  it('preserves video Range headers and subtitle path/query data', async () => {
    const token = await authorize()
    const range = await fetch(api + '/api/webdav/stream?' + new URLSearchParams({ token, path: '/dav/Episode01.mkv' }), { headers: { Range: 'bytes=4-7' } })
    expect(range.status).toBe(206)
    expect(range.headers.get('content-range')).toBe('bytes 4-7/16')
    expect(await range.text()).toBe('4567')
    const siblings = await fetch(api + '/api/webdav/subtitle-files?' + new URLSearchParams({ token, path: '/dav/Episode01.mkv' }))
    expect(siblings.status).toBe(200)
    expect((await siblings.json()).entries).toEqual([expect.objectContaining({ name: 'Episode01.zh.ass' })])
    const text = await fetch(api + '/api/webdav/subtitle-file?' + new URLSearchParams({ token, path: '/dav/Episode01.zh.ass' }))
    expect(text.status).toBe(200)
    expect(await text.text()).toBe(subtitle)
  })

  it('returns a useful configuration error when a serverless deployment has no stable secret', async () => {
    const unconfigured = await listen(createApp({ webdavSessionSecret: '', requirePersistentWebdavSecret: true }))
    const response = await fetch(unconfigured + '/api/webdav/authorize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: upstream + '/dav/' }) })
    expect(response.status).toBe(503)
    expect(await response.json()).toHaveProperty('code', 'WEBDAV_SESSION_NOT_CONFIGURED')
  })
})
