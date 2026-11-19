import { DOMParser as XmlDOMParser } from '@xmldom/xmldom'
import { describe, expect, it, vi } from 'vitest'
import { parseBilibiliFields, parseBilibiliInput, parseBilibiliXml } from './danmakuXml'

class StrictDOMParser extends XmlDOMParser {
  constructor() {
    super({ onError: (level, message) => { if (level !== 'warning') throw new Error(message) } })
  }
}

vi.stubGlobal('DOMParser', StrictDOMParser)

describe('parseBilibiliFields', () => {
  it('parses valid fields, trims text and normalizes every supported mode to scroll', () => {
    expect(parseBilibiliFields('1.25,5,25,0,16777215,0', '  hello & world  ', 0)).toEqual({
      id: 0, time: 1.25, mode: 1, color: '#000000', text: 'hello & world',
    })
  })
  it('keeps pure black', () => expect(parseBilibiliFields('0,1,25,0,0,0', 'x', 2)?.color).toBe('#000000'))
  it.each([
    [null, 'missing p'], ['1,1', 'short fields'], ['x,1,25,0,0', 'invalid time'],
    ['-1,1,25,0,0', 'negative time'], ['1,7,25,0,0', 'unsupported mode'],
    ['1,1,25,-1,0', 'negative color'], ['1,1,25,16777216,0', 'large color'],
    ['1,1,25,wat,0', 'nonnumeric color'],
  ] as const)('rejects %s (%s)', (p, _reason) => expect(parseBilibiliFields(p, 'valid text', 1)).toBeNull())
  it('rejects empty text when fields are otherwise valid', () => expect(parseBilibiliFields('1,1,25,0,0', ' ', 1)).toBeNull())
  it('truncates content to 500 characters', () => expect(parseBilibiliFields('1,1,25,0,0', 'x'.repeat(501), 0)?.text).toHaveLength(500))
})

describe('parseBilibiliInput', () => {
  it('accepts a BV id and a video URL with page query', () => {
    expect(parseBilibiliInput('BV1xx411c7mD')).toEqual({ bvid: 'BV1xx411c7mD', page: 1 })
    expect(parseBilibiliInput('https://www.bilibili.com/video/BV1xx411c7mD/?p=3')).toEqual({ bvid: 'BV1xx411c7mD', page: 3 })
  })
  it.each(['notBV1xx411c7mD', 'BV0xx411c7mD', 'https://evil.example/video/BV1xx411c7mD', 'https://bilibili.com/video/BV1xx411c7mD?p=0'])('rejects invalid input %s', (input) => expect(parseBilibiliInput(input)).toBeNull())
})

describe('parseBilibiliXml', () => {
  it('parses XML entities and sorts comments by time', () => {
    expect(parseBilibiliXml('<i><d p="2,1,25,16777215,0,0">later</d><d p="1,1,25,0,0,0">A &amp; B</d></i>')).toEqual([
      { id: 1, time: 1, mode: 1, color: '#000000', text: 'A & B' },
      { id: 0, time: 2, mode: 1, color: '#ffffff', text: 'later' },
    ])
  })
  it('rejects malformed XML, wrong root, and entity declarations', () => {
    expect(() => parseBilibiliXml('<i><d></i>')).toThrow()
    expect(() => parseBilibiliXml('<root/>')).toThrow()
    expect(() => parseBilibiliXml('<!DOCTYPE i [<!ENTITY x "boom">]><i/>')).toThrow()
  })
})
