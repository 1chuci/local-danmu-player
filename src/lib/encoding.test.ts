import { describe, expect, it } from 'vitest'
import { decodeSubtitleText } from './encoding'

describe('decodeSubtitleText', () => {
  it('decodes UTF-8 BOM subtitles', () => {
    expect(decodeSubtitleText(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Dialogue: test')]))).toBe('Dialogue: test')
  })

  it('decodes UTF-16LE BOM subtitles', () => {
    const raw = new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x53, 0x00, 0x53, 0x00])
    expect(decodeSubtitleText(raw)).toBe('ASS')
  })

  it('decodes UTF-16BE BOM subtitles', () => {
    const raw = new Uint8Array([0xfe, 0xff, 0x00, 0x41, 0x00, 0x53, 0x00, 0x53])
    expect(decodeSubtitleText(raw)).toBe('ASS')
  })

  it('detects UTF-16LE without a BOM', () => {
    const raw = new Uint8Array([0x41, 0x00, 0x53, 0x00, 0x53, 0x00, 0x20, 0x00, 0x58, 0x00])
    expect(decodeSubtitleText(raw)).toBe('ASS X')
  })
})
