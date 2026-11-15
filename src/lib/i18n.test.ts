import { describe, expect, it } from 'vitest'
import { translate } from './i18n'

describe('translate', () => {
  it('interpolates params', () => {
    expect(translate('zh-CN', 'loadedComments', { count: 5 })).toBe('已加载 5 条弹幕')
  })

  it('falls back to the key for unknown keys', () => {
    expect(translate('zh-CN', 'missingKey')).toBe('missingKey')
  })
})
