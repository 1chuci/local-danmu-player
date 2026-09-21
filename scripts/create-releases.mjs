import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 用法: node scripts/create-releases.mjs <tag> <发布说明文件>
// 环境变量: GH_TOKEN（有 repo 权限的 Personal Access Token）
const [tag, notesFile] = process.argv.slice(2)
if (!tag || !notesFile) {
  console.error('用法: node scripts/create-releases.mjs <tag> <发布说明文件>')
  process.exit(1)
}

const token = process.env.GH_TOKEN
if (!token) throw new Error('GH_TOKEN 未设置')
const repo = '1chuci/local-danmu-player'
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'local-danmu-player-release',
}

const body = readFileSync(resolve(notesFile), 'utf8')
const response = await fetch(`https://api.github.com/repos/${repo}/releases`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({ tag_name: tag, name: tag, body, draft: false, prerelease: false }),
})
const data = await response.json()
if (!response.ok) {
  console.error(`创建 Release 失败: ${response.status} ${JSON.stringify(data)}`)
  process.exit(1)
}
console.log(`created release ${tag} -> ${data.html_url}`)
