import { describe, expect, it } from 'vitest'
import { integerToColor, parseComments } from './danmaku'

describe('integerToColor', () => {
  it('renders full 6-digit hex', () => {
    expect(integerToColor(0x112233)).toBe('#112233')
  })

  it('renders pure black as black (regression)', () => {
    expect(integerToColor(0)).toBe('#000000')
  })

  it('treats non-finite input as white', () => {
    expect(integerToColor(NaN)).toBe('#ffffff')
    expect(integerToColor(Infinity)).toBe('#ffffff')
  })

  it('clamps out-of-range values', () => {
    expect(integerToColor(-1)).toBe('#000000')
    expect(integerToColor(0xffffff + 1)).toBe('#ffffff')
  })
})

describe('parseComments', () => {
  it('parses, trims and sorts comments', () => {
    const result = parseComments([
      { cid: 2, p: '5,1,16777215', m: '  后一条  ' },
      { cid: 1, p: '1.5,5,16711680', m: '前一条' },
    ])
    expect(result).toEqual([
      { id: 1, time: 1.5, mode: 5, color: '#ff0000', text: '前一条' },
      { id: 2, time: 5, mode: 1, color: '#ffffff', text: '后一条' },
    ])
  })

  it('drops empty text and invalid/negative time', () => {
    const result = parseComments([
      { cid: 1, p: '1,1,0', m: '   ' },
      { cid: 2, p: 'x,1,0', m: '坏时间' },
      { cid: 3, p: '-3,1,0', m: '负时间' },
      { cid: 4, p: '2,1,255', m: '有效' },
    ])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(4)
  })
})
