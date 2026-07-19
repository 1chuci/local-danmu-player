import express from 'express'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import app from './app.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const dist = resolve(root, 'dist')
if (existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h' }))
  app.get('*path', (_request, response) => response.sendFile(resolve(dist, 'index.html')))
}

const port = Number(process.env.PORT || 8787)
app.listen(port, () => console.log(`Local Danmu Player server listening on http://localhost:${port}`))
