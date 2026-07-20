import { createVercelHandler } from '../../../server/vercel.mjs'

export default createVercelHandler((request, url) => {
  const episodeId = request.query?.episodeId ?? url.pathname.split('/').filter(Boolean).at(-1)
  return `/api/dandanplay/comments/${encodeURIComponent(String(episodeId ?? ''))}`
})
