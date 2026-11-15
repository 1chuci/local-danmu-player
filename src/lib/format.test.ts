import { describe, expect, it } from 'vitest'
import { formatTime } from './format'

describe('formatTime', () => {
  it('formats mm:ss under one hour', () => {
    expect(formatTime(0)).toBe('00:00')
    expect(formatTime(65)).toBe('01:05')
    expect(formatTime(59.9)).toBe('00:59')
  })

  it('formats hh:mm:ss from one hour', () => {
    expect(formatTime(3661)).toBe('01:01:01')
  })

  it('never goes negative or NaN', () => {
    expect(formatTime(-5)).toBe('00:00')
    expect(formatTime(NaN)).toBe('00:00')
  })
})
