export function safeDecode(value) {
  try {
    return decodeURIComponent(String(value ?? ''))
  } catch {
    return String(value ?? '')
  }
}

export function basename(path) {
  const clean = String(path ?? '').replace(/\/+$/, '')
  const index = clean.lastIndexOf('/')
  return index < 0 ? clean : clean.slice(index + 1)
}

export function normalizePath(path) {
  let result = String(path ?? '').trim()
  if (!result.startsWith('/')) result = '/' + result
  result = result.replace(/\/{2,}/g, '/')
  if (result.length > 1) result = result.replace(/\/+$/, '')
  return result
}

export function joinPath(basePath, ...parts) {
  const head = String(basePath ?? '').replace(/\/+$/, '')
  const tail = parts
    .map((part) => String(part ?? '').replace(/^\/+/, '').replace(/\/+$/, ''))
    .filter(Boolean)
    .join('/')
  if (!tail) return head || '/'
  return (head + '/' + tail).replace(/\/{2,}/g, '/')
}

function firstTag(xml, tag) {
  const expression = new RegExp('<(?:\\w+:)?' + tag + '\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?' + tag + '>', 'i')
  const match = expression.exec(xml)
  return match ? match[1] : null
}

export function parsePropfind(xml) {
  const results = []
  const responseExpression = /<(?:\w+:)?response\b[^>]*>([\s\S]*?)<\/(?:\w+:)?response>/g
  let match
  while ((match = responseExpression.exec(xml)) !== null) {
    const block = match[1]
    const href = firstTag(block, 'href')
    if (href == null) continue
    const displayname = firstTag(block, 'displayname')
    const contentLength = firstTag(block, 'getcontentlength')
    results.push({
      href: href.trim(),
      displayname: displayname == null ? '' : displayname.trim(),
      size: contentLength == null ? 0 : Number(contentLength.trim()) || 0,
      isCollection: /<(?:\w+:)?collection(?:\s[^>]*)?\/?>/i.test(block),
    })
  }
  return results
}

// Keep Chinese names and episode numbers in the same order on Windows and Vercel.
const nameCollator = new Intl.Collator('zh-CN', { numeric: true })

export function createWebdavClient({ url, username = '', password = '', fetchImpl = fetch }) {
  const configured = Boolean(url)
  const origin = configured ? new URL(url).origin : ''
  const basePath = configured ? normalizePath(new URL(url).pathname) : '/'
  const authHeaders = username ? { Authorization: 'Basic ' + Buffer.from(username + ':' + password).toString('base64') } : {}

  function notConfiguredError() {
    const error = new Error('WebDAV 尚未配置')
    error.code = 'WEBDAV_NOT_CONFIGURED'
    error.status = 503
    return error
  }

  function httpError(status, body) {
    const error = new Error('WebDAV 请求失败 (' + status + ')')
    error.status = status
    if (body) error.body = String(body).slice(0, 500)
    return error
  }

  function absolutePath(href) {
    const decoded = safeDecode(href)
    if (/^https?:\/\//i.test(decoded)) return normalizePath(new URL(decoded).pathname)
    if (decoded.startsWith('/')) return normalizePath(decoded)
    return normalizePath(joinPath(basePath, decoded))
  }

  async function list(path = '') {
    if (!configured) throw notConfiguredError()
    const targetPath = normalizePath(path || basePath)
    const requestUrl = origin + (targetPath === '/' ? '/' : targetPath + '/')
    const response = await fetchImpl(requestUrl, {
      method: 'PROPFIND',
      headers: { ...authHeaders, Depth: '1', Accept: 'application/xml, text/xml', 'Content-Type': 'application/xml; charset=utf-8' },
      body: '<?xml version="1.0" encoding="utf-8"?><D:propfind xmlns:D="DAV:"><D:prop><D:displayname/><D:getcontentlength/><D:resourcetype/></D:prop></D:propfind>',
      signal: AbortSignal.timeout(30000),
    })
    const xml = await response.text()
    if (!response.ok) throw httpError(response.status, xml)
    const entries = []
    for (const item of parsePropfind(xml)) {
      const entryPath = absolutePath(item.href)
      if (!entryPath || entryPath === targetPath) continue
      const name = item.displayname || basename(entryPath)
      if (!name) continue
      entries.push({ name, path: entryPath, size: item.size, isDirectory: item.isCollection })
    }
    entries.sort((left, right) => {
      if (left.isDirectory !== right.isDirectory) return left.isDirectory ? -1 : 1
      const byName = nameCollator.compare(left.name, right.name)
      if (byName) return byName
      // Numeric equivalents such as 2/02 must not depend on upstream response order.
      if (left.name !== right.name) return left.name < right.name ? -1 : 1
      return left.path < right.path ? -1 : left.path > right.path ? 1 : 0
    })
    return { path: targetPath, entries }
  }

  async function openStream(path, range, signal) {
    if (!configured) throw notConfiguredError()
    const requestUrl = origin + normalizePath(path)
    const headers = { ...authHeaders }
    if (range) headers.Range = range
    return fetchImpl(requestUrl, { method: 'GET', headers, redirect: 'follow', signal })
  }

  function mediaLocation(path) {
    if (!configured) throw notConfiguredError()
    return { url: origin + normalizePath(path), authHeader: authHeaders.Authorization || '' }
  }

  return { configured, basePath, list, openStream, mediaLocation }
}

export default createWebdavClient
