import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const token = process.env.GH_TOKEN
if (!token) throw new Error('GH_TOKEN missing')
const releaseDir = process.env.LDP_RELEASE_DIR
if (!releaseDir) throw new Error('LDP_RELEASE_DIR missing')
const repo = '1chuci/local-danmu-player'
const base = 'https://api.github.com'
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'local-danmu-player-release',
}

async function createRelease(tag, name, notesFile) {
  const body = readFileSync(resolve(releaseDir, notesFile), 'utf8')
  const response = await fetch(`${base}/repos/${repo}/releases`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag_name: tag, name, body, draft: false, prerelease: false }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(`create release ${tag} failed: ${response.status} ${JSON.stringify(data)}`)
  console.log(`created release ${tag} -> ${data.html_url}`)
  return data
}

async function uploadAsset(release, filePath, fileName) {
  const url = `${release.upload_url.replace('{?name,label}', '')}?name=${encodeURIComponent(fileName)}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/zip' },
    body: readFileSync(resolve(releaseDir, filePath)),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`upload ${fileName} failed: ${response.status} ${JSON.stringify(data)}`)
  console.log(`uploaded ${fileName} -> ${data.browser_download_url}`)
}

const v010 = await createRelease('v0.1.0', 'v0.1.0', 'notes-v0.1.0.md')
const v011 = await createRelease('v0.1.1', 'v0.1.1', 'notes-v0.1.1.md')
await uploadAsset(v011, 'local-danmu-player-v0.1.1-dist.zip', 'local-danmu-player-v0.1.1-dist.zip')
console.log('done')
