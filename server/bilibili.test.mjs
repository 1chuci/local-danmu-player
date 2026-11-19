import { describe, expect, it, vi } from 'vitest'
import { createBilibiliClient } from './bilibili.mjs'

const bvid = 'BV1xx411c7mD'
const metadata = {
  code: 0,
  data: {
    title: '字幕君交流场所',
    pages: [
      { page: 1, cid: 62131, part: '第一P', duration: 2055 },
      { page: 2, cid: 98765, part: '第二P', duration: 120 },
    ],
  },
}
const xml = '<?xml version="1.0"?><i><d p="1.25000,1,25,16777215,0,0,hash,90071992547409930,10">hello &amp; world</d></i>'

function response(body, init = {}) {
  return new Response(body, { status: 200, ...init })
}

function fetchQueue(...responses) {
  const fetchImpl = vi.fn(async () => responses.shift())
  return { fetchImpl, client: createBilibiliClient({ fetchImpl }) }
}

describe('createBilibiliClient', () => {
  it('maps Bilibili pages and uses fixed public request settings', async () => {
    const { fetchImpl, client } = fetchQueue(response(JSON.stringify(metadata)))
    await expect(client.getVideo(bvid)).resolves.toEqual({
      bvid,
      title: '字幕君交流场所',
      pages: [
        { page: 1, cid: 62131, part: '第一P', duration: 2055 },
        { page: 2, cid: 98765, part: '第二P', duration: 120 },
      ],
    })
    const [url, options] = fetchImpl.mock.calls[0]
    expect(url.origin).toBe('https://api.bilibili.com')
    expect(url.pathname).toBe('/x/web-interface/view')
    expect(url.searchParams.get('bvid')).toBe(bvid)
    expect(options.redirect).toBe('error')
    expect(options.headers).toEqual({ Referer: 'https://www.bilibili.com/', 'User-Agent': 'LocalDanmuPlayer/1.0' })
    expect(options.headers).not.toHaveProperty('Cookie')
  })

  it('resolves exact page cid and returns XML unchanged', async () => {
    const { fetchImpl, client } = fetchQueue(response(JSON.stringify(metadata)), response(xml, { headers: { 'content-type': 'application/xml' } }))
    await expect(client.getComments(bvid, 2)).resolves.toEqual({
      bvid, title: '字幕君交流场所', page: 2, cid: 98765, part: '第二P', xml,
    })
    const [url, options] = fetchImpl.mock.calls[1]
    expect(url.origin).toBe('https://api.bilibili.com')
    expect(url.pathname).toBe('/x/v1/dm/list.so')
    expect(url.searchParams.get('oid')).toBe('98765')
    expect(options.redirect).toBe('error')
  })

  it.each(['', 'BV1xx411c7mDextra', 'https://evil.example/BV1xx411c7mD', 'bv1xx411c7mD', 'BV123'])('rejects invalid BV input %j before fetching', async (invalid) => {
    const { fetchImpl, client } = fetchQueue()
    await expect(client.getVideo(invalid)).rejects.toMatchObject({ code: 'INVALID_BVID', status: 400 })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1'])('rejects invalid page %j before fetching', async (page) => {
    const { fetchImpl, client } = fetchQueue()
    await expect(client.getComments(bvid, page)).rejects.toMatchObject({ code: 'INVALID_PAGE', status: 400 })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects pages not present instead of falling back to page one', async () => {
    const { fetchImpl, client } = fetchQueue(response(JSON.stringify(metadata)))
    await expect(client.getComments(bvid, 3)).rejects.toMatchObject({ code: 'PAGE_NOT_FOUND', status: 404 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('surfaces API error codes and messages', async () => {
    const { client } = fetchQueue(response(JSON.stringify({ code: -404, message: '视频不存在' })))
    await expect(client.getVideo(bvid)).rejects.toMatchObject({ code: 'UPSTREAM_API_ERROR', status: 502, message: '视频不存在' })
  })

  it('rejects non-JSON metadata', async () => {
    const { client } = fetchQueue(response('<html>blocked</html>'))
    await expect(client.getVideo(bvid)).rejects.toMatchObject({ code: 'UPSTREAM_INVALID_JSON', status: 502 })
  })

  it('preserves upstream HTTP status and useful body message', async () => {
    const { client } = fetchQueue(response(JSON.stringify({ message: 'rate limited' }), { status: 429 }))
    await expect(client.getVideo(bvid)).rejects.toMatchObject({ code: 'UPSTREAM_HTTP_ERROR', status: 429, message: 'rate limited' })
  })

  it('rejects oversized metadata and XML bodies', async () => {
    const hugeMetadata = new Response('x', { status: 200, headers: { 'content-length': String(2 * 1024 * 1024 + 1) } })
    const { client: metadataClient } = fetchQueue(hugeMetadata)
    await expect(metadataClient.getVideo(bvid)).rejects.toMatchObject({ code: 'UPSTREAM_RESPONSE_TOO_LARGE', status: 502 })

    const hugeXml = new Response('x', { status: 200, headers: { 'content-length': String(12 * 1024 * 1024 + 1) } })
    const { client: xmlClient } = fetchQueue(response(JSON.stringify(metadata)), hugeXml)
    await expect(xmlClient.getComments(bvid, 1)).rejects.toMatchObject({ code: 'UPSTREAM_RESPONSE_TOO_LARGE', status: 502 })
  })

  it('maps upstream timeout and rejects invalid XML', async () => {
    const timeoutFetch = vi.fn(async () => { throw new DOMException('timeout', 'AbortError') })
    await expect(createBilibiliClient({ fetchImpl: timeoutFetch }).getVideo(bvid)).rejects.toMatchObject({ code: 'UPSTREAM_TIMEOUT', status: 502 })

    const { client } = fetchQueue(response(JSON.stringify(metadata)), response('<root/>'))
    await expect(client.getComments(bvid, 1)).rejects.toMatchObject({ code: 'UPSTREAM_INVALID_XML', status: 502 })
  })
})
