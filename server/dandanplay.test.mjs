import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createSignature } from './dandanplay.mjs'

describe('createSignature', () => {
  it('uses AppId + timestamp + path + AppSecret', () => {
    const input = 'app-id1735660800/api/v2/comment/12345app-secret'
    const expected = createHash('sha256').update(input).digest('base64')
    expect(createSignature('app-id', '1735660800', '/api/v2/comment/12345', 'app-secret')).toBe(expected)
  })
})
