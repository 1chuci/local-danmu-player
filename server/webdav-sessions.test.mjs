import { describe, expect, it } from 'vitest'
import { createWebdavSessions } from './webdav-sessions.mjs'

const credentials = { url: 'https://dav.example/dav/', username: '测试用户', password: 'private-password' }
const secret = 'test-only-stable-deployment-secret'

describe('WebDAV encrypted sessions', () => {
  it('survives cold starts with the same secret without storing credentials in plaintext', () => {
    const first = createWebdavSessions({ secret })
    const token = first.issue(credentials)
    const second = createWebdavSessions({ secret })
    expect(second.read(token)).toMatchObject(credentials)
    expect(Buffer.from(token.slice(3), 'base64url').includes(Buffer.from(credentials.password))).toBe(false)
    expect(first.issue(credentials)).not.toBe(token)
  })

  it('rejects changed ciphertext, another deployment secret, and malformed tokens', () => {
    const sessions = createWebdavSessions({ secret })
    const token = sessions.issue(credentials)
    const bytes = Buffer.from(token.slice(3), 'base64url')
    bytes[30] ^= 1
    expect(sessions.read('v1.' + bytes.toString('base64url'))).toBeNull()
    expect(createWebdavSessions({ secret: 'different-deployment' }).read(token)).toBeNull()
    for (const invalid of ['', 'old-uuid-token', 'v1.', 'v1.eA', null, ['token'], 'v1.' + 'A'.repeat(12000)]) {
      expect(sessions.read(invalid)).toBeNull()
    }
  })

  it('expires after 24 hours even in a new instance', () => {
    let currentTime = 1000
    const token = createWebdavSessions({ secret, now: () => currentTime }).issue(credentials)
    const coldInstance = createWebdavSessions({ secret, now: () => currentTime })
    currentTime += 24 * 60 * 60 * 1000 - 1
    expect(coldInstance.read(token)).toMatchObject(credentials)
    currentTime += 1
    expect(coldInstance.read(token)).toBeNull()
  })

  it('requires a persistent secret in serverless environments and limits token size', () => {
    const sessions = createWebdavSessions({ requirePersistentSecret: true })
    expect(() => sessions.issue(credentials)).toThrow(expect.objectContaining({ code: 'WEBDAV_SESSION_NOT_CONFIGURED', status: 503 }))
    expect(sessions.read('v1.eA')).toBeNull()
    expect(() => createWebdavSessions({ secret }).issue({ ...credentials, password: 'a'.repeat(12000) })).toThrow(expect.objectContaining({ status: 400 }))
  })

  it('keeps local development usable without configuring a secret', () => {
    const local = createWebdavSessions()
    expect(local.read(local.issue(credentials))).toMatchObject(credentials)
  })
})
