import { createVercelHandler } from '../../server/vercel.mjs'

// Vercel's file-based dynamic route explicitly registers every WebDAV action.
// Keep the public URL/query intact for streams and subtitle requests as well.
export default createVercelHandler((request, url) => {
  const action = request.query?.action ?? url.pathname.split('/').filter(Boolean).at(-1)
  return `/api/webdav/${encodeURIComponent(String(action ?? ''))}`
})
