import { describe, it, expect, afterEach } from 'vitest'
import { assTimeToSrt, assTextToPlain, assToSrt, createRangeCachingFetcher, RangeBudgetExceededError } from './mkv-subtitles.mjs'

describe('assTimeToSrt', () => {
  it('两位小数转毫秒', () => {
    expect(assTimeToSrt('0:00:01.50')).toBe('00:00:01,500')
  })
  it('带小时', () => {
    expect(assTimeToSrt('1:02:03.4')).toBe('01:02:03,400')
  })
  it('非法输入回退零', () => {
    expect(assTimeToSrt('garbage')).toBe('00:00:00,000')
  })
})

describe('assTextToPlain', () => {
  it('去除 override 标签', () => {
    expect(assTextToPlain('{\\an8}Hello')).toBe('Hello')
  })
  it('\\N 转换行', () => {
    expect(assTextToPlain('A\\NB')).toBe('A\nB')
  })
  it('\\h 转空格', () => {
    expect(assTextToPlain('A\\hB')).toBe('A B')
  })
})

describe('assToSrt', () => {
  it('解析 Dialogue 转 srt', () => {
    const ass = [
      '[Script Info]',
      'Title: test',
      '',
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      'Dialogue: 0,0:00:01.00,0:00:02.50,Default,,0,0,0,,{\\an8}Hello World',
      'Dialogue: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,Line one\\NLine two',
      'Dialogue: 0,0:00:05.00,0:00:06.00,Default,,0,0,0,,',
    ].join('\n')
    expect(assToSrt(ass)).toBe([
      '1',
      '00:00:01,000 --> 00:00:02,500',
      'Hello World',
      '',
      '2',
      '00:00:03,000 --> 00:00:04,000',
      'Line one',
      'Line two',
      '',
    ].join('\n'))
  })
})

describe('createRangeCachingFetcher', () => {
  const FILE_SIZE = 10 * 1024 * 1024 // 10MB
  const realFetch = globalThis.fetch
  let requests

  afterEach(() => { globalThis.fetch = realFetch })

  function mockRangeServer() {
    requests = []
    globalThis.fetch = async (url, init = {}) => {
      const range = init.headers && init.headers.Range
      requests.push(range)
      const m = /bytes=(\d+)-(\d+)/.exec(range || '')
      if (!m) {
        const full = new Uint8Array(FILE_SIZE).fill(7)
        return new Response(full, { status: 200, headers: { 'Content-Length': String(FILE_SIZE) } })
      }
      let start = Number(m[1])
      let end = Number(m[2])
      if (start >= FILE_SIZE) {
        return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + FILE_SIZE } })
      }
      end = Math.min(end, FILE_SIZE - 1)
      const len = end - start + 1
      const data = new Uint8Array(len)
      for (let i = 0; i < len; i += 1) data[i] = (start + i) % 256
      return new Response(data, {
        status: 206,
        headers: {
          'Content-Range': 'bytes ' + start + '-' + end + '/' + FILE_SIZE,
          'Content-Length': String(len),
          'Accept-Ranges': 'bytes',
        },
      })
    }
  }

  it('精确转发 Range（不放大）', async () => {
    mockRangeServer()
    const fetcher = createRangeCachingFetcher(null)
    const resp = await fetcher('http://x', { headers: { Range: 'bytes=0-262143' } })
    expect(resp.status).toBe(206)
    expect(resp.headers.get('Content-Range')).toBe('bytes 0-262143/' + FILE_SIZE)
    const buf = new Uint8Array(await resp.arrayBuffer())
    expect(buf.length).toBe(262144)
    expect(buf[0]).toBe(0)
    expect(requests).toEqual(['bytes=0-262143'])
  })

  it('相同区间命中缓存，只发一次请求', async () => {
    mockRangeServer()
    const fetcher = createRangeCachingFetcher(null)
    await fetcher('http://x', { headers: { Range: 'bytes=100-200' } })
    const resp = await fetcher('http://x', { headers: { Range: 'bytes=100-200' } })
    const buf = new Uint8Array(await resp.arrayBuffer())
    expect(buf.length).toBe(101)
    expect(requests.length).toBe(1)
  })

  it('相邻区间各自请求，互不合并', async () => {
    mockRangeServer()
    const fetcher = createRangeCachingFetcher(null)
    await fetcher('http://x', { headers: { Range: 'bytes=0-32767' } })
    await fetcher('http://x', { headers: { Range: 'bytes=32768-65535' } })
    expect(requests.length).toBe(2)
  })

  it('返回的 Content-Range 与实际返回字节一致', async () => {
    mockRangeServer()
    const fetcher = createRangeCachingFetcher(null)
    const resp = await fetcher('http://x', { headers: { Range: 'bytes=8388608-8650751' } })
    expect(resp.status).toBe(206)
    expect(resp.headers.get('Content-Range')).toBe('bytes 8388608-8650751/' + FILE_SIZE)
    const buf = new Uint8Array(await resp.arrayBuffer())
    expect(buf.length).toBe(262144)
  })

  it('网盘返回 200（不支持 Range）时原样透传', async () => {
    globalThis.fetch = async () => {
      const full = new Uint8Array(FILE_SIZE).fill(7)
      return new Response(full, { status: 200, headers: { 'Content-Length': String(FILE_SIZE) } })
    }
    const fetcher = createRangeCachingFetcher(null)
    const resp = await fetcher('http://x', { headers: { Range: 'bytes=0-262143' } })
    expect(resp.status).toBe(200)
  })

  it('超过字节预算抛 RangeBudgetExceededError', async () => {
    mockRangeServer()
    const fetcher = createRangeCachingFetcher(null, { budgetBytes: 100 })
    await fetcher('http://x', { headers: { Range: 'bytes=0-199' } })
    await expect(fetcher('http://x', { headers: { Range: 'bytes=200-399' } })).rejects.toThrow(RangeBudgetExceededError)
  })

  it('超过时间预算抛 RangeBudgetExceededError', async () => {
    mockRangeServer()
    const fetcher = createRangeCachingFetcher(null, { budgetMs: -1 })
    await expect(fetcher('http://x', { headers: { Range: 'bytes=0-99' } })).rejects.toThrow(RangeBudgetExceededError)
  })
})
