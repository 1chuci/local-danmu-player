import { createHash } from 'node:crypto'

const API_ORIGIN = 'https://api.dandanplay.net'

export function createSignature(appId, timestamp, path, appSecret) {
  return createHash('sha256')
    .update(`${appId}${timestamp}${path}${appSecret}`, 'utf8')
    .digest('base64')
}

export function createDandanplayClient({ appId, appSecret, fetchImpl = fetch }) {
  const configured = Boolean(appId && appSecret)

  async function request(path, options = {}) {
    if (!configured) {
      const error = new Error('弹弹play应用凭证尚未配置')
      error.code = 'CREDENTIALS_NOT_CONFIGURED'
      throw error
    }

    const timestamp = Math.floor(Date.now() / 1000).toString()
    const signature = createSignature(appId, timestamp, path, appSecret)
    const response = await fetchImpl(`${API_ORIGIN}${path}${options.query ?? ''}`, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-AppId': appId,
        'X-Timestamp': timestamp,
        'X-Signature': signature,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      redirect: 'follow',
    })

    const text = await response.text()
    let data
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      data = { message: text || '上游服务返回了无法解析的数据' }
    }

    if (!response.ok) {
      const error = new Error(response.headers.get('x-error-message') || data.message || `上游请求失败 (${response.status})`)
      error.status = response.status
      throw error
    }

    return data
  }

  return { configured, request }
}
