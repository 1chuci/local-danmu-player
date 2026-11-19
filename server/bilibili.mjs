// Bilibili danmaku companion integration, inspired by agefans Enhance - B站弹幕源插件 (GreasyFork script 585620, v1.0.0, MIT):
// https://greasyfork.org/scripts/585620-agefans-enhance-b%E7%AB%99%E5%BC%B9%E5%B9%95%E6%BA%90%E6%8F%92%E4%BB%B6
// https://update.greasyfork.org/scripts/585620/agefans%20Enhance%20-%20B%E7%AB%99%E5%BC%B9%E5%B9%95%E6%BA%90%E6%8F%92%E4%BB%B6.user.js

const API_ORIGIN = 'https://api.bilibili.com'
const VIDEO_PATH = '/x/web-interface/view'
const XML_PATH = '/x/v1/dm/list.so'
const REQUEST_TIMEOUT_MS = 15_000
const MAX_METADATA_BYTES = 2 * 1024 * 1024
const MAX_XML_BYTES = 12 * 1024 * 1024
const MAX_ERROR_BYTES = 64 * 1024
const BV_PATTERN = /^BV[0-9A-Za-z]{10}$/

function createError(message, code, status = 502, cause) {
  const error = new Error(message, cause === undefined ? undefined : { cause })
  error.code = code
  error.status = status
  return error
}

function validateBvid(bvid) {
  if (typeof bvid !== 'string' || !BV_PATTERN.test(bvid)) throw createError('BV 号格式无效', 'INVALID_BVID', 400)
}

function validatePage(page) {
  if (!Number.isSafeInteger(page) || page <= 0) throw createError('分P编号必须是正安全整数', 'INVALID_PAGE', 400)
}

async function readBoundedText(response, maxBytes, label) {
  const declaredLength = Number(response.headers?.get?.('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel?.().catch(() => {})
    throw createError(`上游${label}超过大小限制 (${maxBytes} bytes)`, 'UPSTREAM_RESPONSE_TOO_LARGE', 502)
  }
  if (!response.body?.getReader) {
    const text = await response.text()
    if (Buffer.byteLength(text, 'utf8') > maxBytes) throw createError(`上游${label}超过大小限制 (${maxBytes} bytes)`, 'UPSTREAM_RESPONSE_TOO_LARGE', 502)
    return text
  }
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => {})
        throw createError(`上游${label}超过大小限制 (${maxBytes} bytes)`, 'UPSTREAM_RESPONSE_TOO_LARGE', 502)
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder('utf-8').decode(bytes)
}

function upstreamMessage(text, fallback) {
  try {
    const data = JSON.parse(text)
    return typeof data.message === 'string' && data.message ? data.message : fallback
  } catch { return text.trim().slice(0, 500) || fallback }
}

export function createBilibiliClient({ fetchImpl = fetch } = {}) {
  async function request(path, query, maxBytes, label) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new DOMException('The operation timed out', 'TimeoutError')), REQUEST_TIMEOUT_MS)
    try {
      const url = new URL(path, API_ORIGIN)
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value))
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: { Referer: 'https://www.bilibili.com/', 'User-Agent': 'LocalDanmuPlayer/1.0' },
        redirect: 'error',
        signal: controller.signal,
      })
      if (!response.ok) {
        const text = await readBoundedText(response, MAX_ERROR_BYTES, '错误响应')
        throw createError(upstreamMessage(text, `哔哩哔哩请求失败 (HTTP ${response.status})`), 'UPSTREAM_HTTP_ERROR', response.status)
      }
      return await readBoundedText(response, maxBytes, label)
    } catch (cause) {
      if (cause?.code && cause?.status) throw cause
      const timedOut = controller.signal.aborted || cause?.name === 'TimeoutError' || cause?.name === 'AbortError'
      throw createError(timedOut ? '哔哩哔哩 API 请求超时，请稍后重试' : '无法连接哔哩哔哩 API，请检查网络或稍后重试', timedOut ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_NETWORK_ERROR', 502, cause)
    } finally { clearTimeout(timer) }
  }

  async function getVideo(bvid) {
    validateBvid(bvid)
    const text = await request(VIDEO_PATH, { bvid }, MAX_METADATA_BYTES, '视频信息')
    let data
    try { data = JSON.parse(text) } catch (cause) { throw createError('哔哩哔哩视频信息响应不是有效 JSON', 'UPSTREAM_INVALID_JSON', 502, cause) }
    if (!data || data.code !== 0) throw createError(data?.message || '未找到该 BV 号对应的视频', 'UPSTREAM_API_ERROR', 502)
    const video = data.data
    if (!video || !Array.isArray(video.pages)) throw createError('哔哩哔哩视频信息缺少分P列表', 'UPSTREAM_INVALID_DATA', 502)
    const pages = video.pages.map((item) => ({ page: Number(item?.page), cid: Number(item?.cid), part: String(item?.part ?? ''), duration: Number(item?.duration) }))
    if (!pages.length || pages.some((item) => !Number.isSafeInteger(item.page) || item.page <= 0 || !Number.isSafeInteger(item.cid) || item.cid <= 0 || !Number.isFinite(item.duration) || item.duration < 0)) {
      throw createError('哔哩哔哩视频分P信息无效', 'UPSTREAM_INVALID_DATA', 502)
    }
    return { bvid, title: String(video.title ?? ''), pages }
  }

  async function getComments(bvid, page) {
    validateBvid(bvid)
    validatePage(page)
    const video = await getVideo(bvid)
    const target = video.pages.find((item) => item.page === page)
    if (!target) throw createError('该视频不存在指定分P', 'PAGE_NOT_FOUND', 404)
    const xml = await request(XML_PATH, { oid: target.cid }, MAX_XML_BYTES, '弹幕 XML')
    // Preserve the raw Bilibili p fields: color is fourth, not Dandanplay's third.
    // An empty <i/> is valid; full XML parsing is performed by the frontend.
    if (!/^\s*(?:<\?xml[^>]*\?>\s*)?<i(?:\s[^>]*)?(?:\/>|>)/.test(xml) || /<!DOCTYPE|<!ENTITY/i.test(xml)) {
      throw createError('哔哩哔哩弹幕接口未返回有效 XML', 'UPSTREAM_INVALID_XML', 502)
    }
    return { bvid, title: video.title, page: target.page, cid: target.cid, part: target.part, xml }
  }
  return { getVideo, getComments }
}
