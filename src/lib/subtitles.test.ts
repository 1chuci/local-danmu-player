import { describe, expect, it } from 'vitest'
import { parseAss, parseSrt } from './subtitles'

describe('parseSrt', () => {
  it('parses blocks and strips tags', () => {
    const source = [
      '1',
      '00:00:01,000 --> 00:00:03,000',
      '{\\an8}你好 <i>世界</i>',
      '',
      '2',
      '00:00:05,500 --> 00:00:07,000',
      '第二句',
    ].join('\n')
    expect(parseSrt(source)).toEqual([
      { start: 1, end: 3, text: '你好 世界' },
      { start: 5.5, end: 7, text: '第二句' },
    ])
  })

  it('sorts cues by start time (regression)', () => {
    const source = [
      '1',
      '00:00:10,000 --> 00:00:11,000',
      '后',
      '',
      '2',
      '00:00:01,000 --> 00:00:02,000',
      '前',
    ].join('\n')
    expect(parseSrt(source).map((cue) => cue.text)).toEqual(['前', '后'])
  })

  it('skips malformed blocks', () => {
    const source = [
      '1',
      '00:00:01,000 --> 00:00:02,000',
      '有效',
      '',
      '2',
      '没有时间戳',
    ].join('\n')
    expect(parseSrt(source)).toHaveLength(1)
  })
})


describe('parseAss', () => {
  it('parses timed dialogue, strips ASS override tags, and keeps commas in text', () => {
    const source = [
      '[Script Info]',
      'Title: Fixture',
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      'Dialogue: 0,0:00:02.50,0:00:04.25,Default,,0,0,0,,{\\an8}字幕, 第一行\\N第二行',
      'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\i1}Earlier line{\\i0}',
      '[Fonts]',
      'Dialogue: ignored',
    ].join('\n')
    expect(parseAss(source)).toEqual([
      { start: 1, end: 2, text: 'Earlier line' },
      { start: 2.5, end: 4.25, text: '字幕, 第一行\n第二行' },
    ])
  })

  it('follows custom Events field order and rejects invalid timings', () => {
    const source = [
      '[Events]',
      'Format: Text, End, Start, Layer',
      'Dialogue: Hello, world,0:00:03.00,0:00:01.25,0',
      'Dialogue: broken,0:00:00.00,0:00:02.00,0',
    ].join('\n')
    expect(parseAss(source)).toEqual([{ start: 1.25, end: 3, text: 'Hello, world' }])
  })
})
