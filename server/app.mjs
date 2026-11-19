import express from 'express'
import { Readable } from 'node:stream'
import { createDandanplayClient } from './dandanplay.mjs'
import { createBilibiliClient } from './bilibili.mjs'
import { createWebdavClient } from './webdav.mjs'
import { probeSubtitles, extractSubtitleSrt } from './ffmpeg.mjs'
import { listMkvSubtitleTracks, extractMkvSubtitleSrt } from './mkv-subtitles.mjs'
import { filterSiblingSubtitleEntries } from './sibling-subtitles.mjs'
import { createWebdavSessions } from './webdav-sessions.mjs'

export function createApp({
  webdavSessionSecret = process.env.WEBDAV_SESSION_SECRET || process.env.DANDANPLAY_APP_SECRET,
  requirePersistentWebdavSecret = process.env.VERCEL === '1',
} = {}) {
  const app = express()
  const { issue: issueWebdavToken, read: getWebdavCredentials } = createWebdavSessions({
    secret: webdavSessionSecret,
    requirePersistentSecret: requirePersistentWebdavSecret,
  })
  const client = createDandanplayClient({
    appId: process.env.DANDANPLAY_APP_ID,
    appSecret: process.env.DANDANPLAY_APP_SECRET,
  })
  const bilibili = createBilibiliClient()

  app.disable('x-powered-by')
  app.use(express.json({ limit: '32kb' }))
  app.use((request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Referrer-Policy', 'no-referrer')
    if (request.path.startsWith('/api/webdav/')) response.setHeader('Cache-Control', 'no-store')
    if (request.url === '/config' || request.url.startsWith('/dandanplay/')) {
      request.url = `/api${request.url}`
    }
    next()
  })

  app.get('/api/config', (_request, response) => {
    response.json({ dandanplayConfigured: client.configured })
  })

  app.post('/api/dandanplay/match', async (request, response, next) => {
    const { fileName, fileHash, fileSize, videoDuration = 0 } = request.body ?? {}
    if (typeof fileName !== 'string' || typeof fileHash !== 'string' || !Number.isSafeInteger(fileSize)) {
      return response.status(400).json({ message: '视频匹配参数不完整' })
    }

    try {
      response.json(await client.request('/api/v2/match', {
        method: 'POST',
        body: { fileName, fileHash, fileSize, videoDuration: Math.round(videoDuration), matchMode: 'hashAndFileName' },
      }))
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/dandanplay/search', async (request, response, next) => {
    const anime = String(request.query.anime ?? '').trim()
    if (anime.length < 2 || anime.length > 100) return response.status(400).json({ message: '搜索关键词长度应为 2-100 个字符' })
    try {
      response.json(await client.request('/api/v2/search/episodes', { query: `?anime=${encodeURIComponent(anime)}&v2=true` }))
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/dandanplay/comments/:episodeId', async (request, response, next) => {
    const episodeId = Number(request.params.episodeId)
    if (!Number.isSafeInteger(episodeId) || episodeId <= 0) return response.status(400).json({ message: '弹幕库编号无效' })
    try {
      response.json(await client.request(`/api/v2/comment/${episodeId}`, { query: '?withRelated=true&chConvert=1' }))
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/bilibili/video', async (request, response, next) => {
    try {
      response.json(await bilibili.getVideo(String(request.query.bvid ?? '')))
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/bilibili/comments', async (request, response, next) => {
    const page = Number(request.query.page)
    if (!Number.isSafeInteger(page) || page <= 0) return response.status(400).json({ code: 'INVALID_PAGE', message: '分P编号必须是正整数' })
    try {
      response.json(await bilibili.getComments(String(request.query.bvid ?? ''), page))
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/webdav/authorize', (request, response) => {
    const { url, username = '', password = '' } = request.body ?? {}
    if (typeof url !== 'string' || !url.trim()) return response.status(400).json({ message: '缺少 WebDAV 地址' })
    try {
      void new URL(url.trim())
    } catch {
      return response.status(400).json({ message: 'WebDAV 地址格式无效' })
    }
    const token = issueWebdavToken({
      url: url.trim(),
      username: String(username ?? ''),
      password: String(password ?? ''),
    })
    response.json({ token })
  })

  app.get('/api/webdav/list', async (request, response, next) => {
    const credentials = getWebdavCredentials(request.query.token)
    if (!credentials) return response.status(401).json({ code: 'WEBDAV_SESSION_EXPIRED', message: 'WebDAV 会话已过期，请重新连接' })
    const path = typeof request.query.path === 'string' ? request.query.path : ''
    try {
      response.json(await createWebdavClient(credentials).list(path))
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/webdav/stream', async (request, response, next) => {
    const credentials = getWebdavCredentials(request.query.token)
    if (!credentials) return response.status(401).json({ code: 'WEBDAV_SESSION_EXPIRED', message: 'WebDAV 会话已过期，请重新连接' })
    const path = typeof request.query.path === 'string' ? request.query.path : ''
    if (!path) return response.status(400).json({ message: '缺少文件路径' })
    try {
      const controller = new AbortController()
      const upstream = await createWebdavClient(credentials).openStream(path, request.headers.range, controller.signal)
      const abort = () => controller.abort()
      response.on('close', abort)
      response.on('error', abort)
      response.status(upstream.status)
      const contentType = upstream.headers.get('content-type')
      if (contentType) response.setHeader('Content-Type', contentType)
      const contentLength = upstream.headers.get('content-length')
      if (contentLength) response.setHeader('Content-Length', contentLength)
      const contentRange = upstream.headers.get('content-range')
      if (contentRange) response.setHeader('Content-Range', contentRange)
      response.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes')
      if (upstream.body) {
        const body = Readable.fromWeb(upstream.body)
        body.on('error', () => {
          controller.abort()
          if (!response.destroyed) response.destroy()
        })
        body.pipe(response)
      } else {
        response.end()
      }
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/webdav/match', async (request, response, next) => {
    const { fileName } = request.body ?? {}
    if (typeof fileName !== 'string' || !fileName.trim()) return response.status(400).json({ message: '文件名不能为空' })
    try {
      response.json(await client.request('/api/v2/match', {
        method: 'POST',
        body: { fileName: fileName.trim(), fileHash: '', fileSize: 0, videoDuration: 0, matchMode: 'fileNameOnly' },
      }))
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/webdav/subtitle-tracks', async (request, response, next) => {
    const credentials = getWebdavCredentials(request.query.token)
    if (!credentials) return response.status(401).json({ code: 'WEBDAV_SESSION_EXPIRED', message: 'WebDAV 会话已过期，请重新连接' })
    const path = typeof request.query.path === 'string' ? request.query.path : ''
    if (!path) return response.status(400).json({ message: '缺少文件路径' })
    try {
      const media = createWebdavClient(credentials).mediaLocation(path)
      let tracks
      if (/\.(mkv|webm)$/i.test(path)) {
        try {
          tracks = await listMkvSubtitleTracks(media.url, media.authHeader)
        } catch (error) {
          console.error('[subtitle-tracks] MKV Range 提取失败，回退 ffmpeg：', error?.message || error)
          tracks = await probeSubtitles(media)
        }
      } else {
        tracks = await probeSubtitles(media)
      }
      response.json({ tracks })
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/webdav/subtitle-files', async (request, response, next) => {
    const credentials = getWebdavCredentials(request.query.token)
    if (!credentials) return response.status(401).json({ code: 'WEBDAV_SESSION_EXPIRED', message: 'WebDAV 会话已过期，请重新连接' })
    const path = typeof request.query.path === 'string' ? request.query.path : ''
    if (!path) return response.status(400).json({ message: '缺少视频路径' })
    try {
      const slash = path.lastIndexOf('/')
      const directory = slash > 0 ? path.slice(0, slash) : '/'
      const listing = await createWebdavClient(credentials).list(directory)
      response.json({ entries: filterSiblingSubtitleEntries(listing.entries, path) })
    } catch (error) { next(error) }
  })

  app.get('/api/webdav/subtitle-file', async (request, response, next) => {
    const credentials = getWebdavCredentials(request.query.token)
    if (!credentials) return response.status(401).json({ code: 'WEBDAV_SESSION_EXPIRED', message: 'WebDAV 会话已过期，请重新连接' })
    const path = typeof request.query.path === 'string' ? request.query.path : ''
    if (!path) return response.status(400).json({ message: '缺少字幕路径' })
    if (!/\.(ass|ssa|srt|vtt)$/i.test(path)) return response.status(400).json({ message: '字幕格式不受支持' })
    try {
      const upstream = await createWebdavClient(credentials).openStream(path)
      if (!upstream.ok) return response.status(upstream.status).json({ message: '字幕文件读取失败' })
      response.type('application/octet-stream').send(Buffer.from(await upstream.arrayBuffer()))
    } catch (error) { next(error) }
  })

  app.get('/api/webdav/subtitle', async (request, response, next) => {
    const credentials = getWebdavCredentials(request.query.token)
    if (!credentials) return response.status(401).json({ code: 'WEBDAV_SESSION_EXPIRED', message: 'WebDAV 会话已过期，请重新连接' })
    const path = typeof request.query.path === 'string' ? request.query.path : ''
    const track = Number(request.query.track)
    if (!path) return response.status(400).json({ message: '缺少文件路径' })
    if (!Number.isInteger(track) || track < 0) return response.status(400).json({ message: '字幕轨道编号无效' })
    try {
      const media = createWebdavClient(credentials).mediaLocation(path)
      let srt
      if (/\.(mkv|webm)$/i.test(path)) {
        try {
          srt = await extractMkvSubtitleSrt(media.url, media.authHeader, track)
        } catch (error) {
          if (error.code === 'MKV_TRACK_NOT_FOUND') throw error
          console.error('[subtitle] MKV Range 提取失败，回退 ffmpeg：', error?.message || error)
          srt = await extractSubtitleSrt({ ...media, track })
        }
      } else {
        srt = await extractSubtitleSrt({ ...media, track })
      }
      response.type('text/plain; charset=utf-8').send(srt)
    } catch (error) {
      next(error)
    }
  })

  app.use((error, _request, response, _next) => {
    if (error.code === 'CREDENTIALS_NOT_CONFIGURED') return response.status(503).json({ code: error.code, message: error.message })
    response.status(error.status || 502).json({ code: error.code || 'UPSTREAM_ERROR', message: error.message || '服务暂时不可用' })
  })
  return app
}

export default createApp()
