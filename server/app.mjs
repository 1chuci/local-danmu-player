import express from 'express'
import { createDandanplayClient } from './dandanplay.mjs'

export function createApp() {
  const app = express()
  const client = createDandanplayClient({
    appId: process.env.DANDANPLAY_APP_ID,
    appSecret: process.env.DANDANPLAY_APP_SECRET,
  })

  app.disable('x-powered-by')
  app.use(express.json({ limit: '32kb' }))
  app.use((request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Referrer-Policy', 'no-referrer')
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

  app.use((error, _request, response, _next) => {
    if (error.code === 'CREDENTIALS_NOT_CONFIGURED') return response.status(503).json({ code: error.code, message: error.message })
    response.status(error.status || 502).json({ message: error.message || '服务暂时不可用' })
  })
  return app
}

export default createApp()
