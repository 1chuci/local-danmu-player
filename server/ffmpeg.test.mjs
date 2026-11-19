import { describe, it, expect } from 'vitest'
import { parseSubtitleStreams } from './ffmpeg.mjs'

describe('parseSubtitleStreams', () => {
  it('解析多字幕流，index 为字幕专用序号，language 与 codec 正确', () => {
    const stderr = [
      "Input #0, matroska,webm, from 'x.mkv':",
      '  Stream #0:0: Video: h264 (High), yuv420p, 1920x1080, 23.98 fps',
      '  Stream #0:1(eng): Audio: aac (LC), 48000 Hz, stereo, fltp',
      '  Stream #0:2(eng): Subtitle: ass',
      '  Stream #0:3(chi): Subtitle: subrip',
    ].join('\n')
    expect(parseSubtitleStreams(stderr)).toEqual([
      { index: 0, language: 'eng', codec: 'ass', name: '' },
      { index: 1, language: 'chi', codec: 'subrip', name: '' },
    ])
  })

  it('无语言代码时兜底为 und', () => {
    const stderr = '  Stream #0:2: Subtitle: mov_text'
    expect(parseSubtitleStreams(stderr)).toEqual([
      { index: 0, language: 'und', codec: 'mov_text', name: '' },
    ])
  })

  it('codec 描述含括号时完整保留', () => {
    const stderr = '  Stream #0:5(und): Subtitle: hdmv_pgs_subtitle (pgssub)'
    expect(parseSubtitleStreams(stderr)).toEqual([
      { index: 0, language: 'und', codec: 'hdmv_pgs_subtitle (pgssub)', name: '' },
    ])
  })

  it('兼容 mp4 的 [0xN](lang) 流标识格式', () => {
    const stderr = '  Stream #0:2[0x3](und): Subtitle: mov_text (tx3g / 0x67337874), 0 kb/s (default)'
    expect(parseSubtitleStreams(stderr)).toEqual([
      { index: 0, language: 'und', codec: 'mov_text (tx3g / 0x67337874), 0 kb/s (default)', name: '' },
    ])
  })

  it('无字幕流时返回空数组', () => {
    const stderr = [
      '  Stream #0:0: Video: h264, yuv420p',
      '  Stream #0:1(eng): Audio: aac',
    ].join('\n')
    expect(parseSubtitleStreams(stderr)).toEqual([])
  })

  it('读取流 Metadata 里的 title 作为轨道名(多轨道靠它区分)', () => {
    const stderr = [
      "Input #0, matroska,webm, from 'x.mkv':",
      '  Stream #0:2(chi): Subtitle: ass (default)',
      '    Metadata:',
      '      title           : [XKsub] 简日双语',
      '      BPS             : 1234',
      '  Stream #0:3(jpn): Subtitle: ass',
      '    Metadata:',
      '      title           : [XKsub] 日语',
    ].join('\n')
    const tracks = parseSubtitleStreams(stderr)
    expect(tracks.map((track) => track.name)).toEqual(['[XKsub] 简日双语', '[XKsub] 日语'])
  })

  it('没有 Metadata 块时不误取后续流的 title', () => {
    const stderr = [
      '  Stream #0:2(chi): Subtitle: ass',
      '  Stream #0:3(jpn): Subtitle: ass',
      '    Metadata:',
      '      title           : 日语',
    ].join('\n')
    expect(parseSubtitleStreams(stderr).map((track) => track.name)).toEqual(['', '日语'])
  })
})
