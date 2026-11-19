import crypto from 'node:crypto'

const TOKEN_TTL = 24 * 60 * 60 * 1000
const MAX_TOKEN_LENGTH = 12000
const KEY_CONTEXT = 'local-danmu-player:webdav-session:v1\0'

// Authenticated encryption keeps credentials private while allowing cold instances
// with the same server secret to read a session without a shared in-memory Map.
export function createWebdavSessions({ secret, requirePersistentSecret = false, now = Date.now } = {}) {
  const key = secret
    ? crypto.createHash('sha256').update(KEY_CONTEXT).update(secret).digest()
    : requirePersistentSecret ? null : crypto.randomBytes(32)

  function issue(credentials) {
    if (!key) {
      const error = new Error('在线 WebDAV 需要配置服务端 WEBDAV_SESSION_SECRET 或 DANDANPLAY_APP_SECRET 后重新部署')
      error.code = 'WEBDAV_SESSION_NOT_CONFIGURED'
      error.status = 503
      throw error
    }
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    cipher.setAAD(Buffer.from('webdav:v1'))
    const payload = JSON.stringify({
      url: credentials.url,
      username: credentials.username,
      password: credentials.password,
      expiresAt: now() + TOKEN_TTL,
    })
    const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])
    const token = 'v1.' + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')
    if (token.length > MAX_TOKEN_LENGTH) {
      const error = new Error('WebDAV 连接配置过长')
      error.status = 400
      throw error
    }
    return token
  }

  function read(token) {
    if (!key || typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH || !/^v1\.[A-Za-z0-9_-]+$/.test(token)) return null
    try {
      const bytes = Buffer.from(token.slice(3), 'base64url')
      if (bytes.length <= 28) return null
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12))
      decipher.setAAD(Buffer.from('webdav:v1'))
      decipher.setAuthTag(bytes.subarray(12, 28))
      const payload = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()])
      const entry = JSON.parse(payload.toString('utf8'))
      if (typeof entry.url !== 'string' || typeof entry.username !== 'string' || typeof entry.password !== 'string'
        || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= now()) return null
      return entry
    } catch {
      return null
    }
  }

  return { issue, read }
}
