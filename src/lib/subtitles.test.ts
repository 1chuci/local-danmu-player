import { describe, expect, it } from 'vitest'
import { parseSrt } from './subtitles'

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
