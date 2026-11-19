import { afterEach, describe, expect, it } from 'vitest'
import { defaultSettings, loadSettings, saveSettings } from './storage'

const values = new Map<string, string>()
const localStorageMock = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
}

Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorageMock })

afterEach(() => values.clear())

describe('automatic next preference', () => {
  it('defaults to disabled', () => {
    expect(defaultSettings.autoNext).toBe(false)
    expect(loadSettings().autoNext).toBe(false)
  })

  it('persists a boolean value', () => {
    const settings = { ...defaultSettings, autoNext: true }
    saveSettings(settings)
    expect(loadSettings().autoNext).toBe(true)
  })

  it('ignores malformed stored values', () => {
    values.set('local-danmu-player:settings', JSON.stringify({ autoNext: 'yes' }))
    expect(loadSettings().autoNext).toBe(false)
  })
})
