import type { DanmakuComment } from '../types'
import { integerToColor } from './danmaku'

export const MAX_DANMAKU_XML_BYTES = 12 * 1024 * 1024

/** Adapted from GreasyFork script 585620 and its MIT-licensed agefans Enhance host. */
export function parseBilibiliFields(p: string | null, text: string, id: number): DanmakuComment | null {
  if (!p || !Number.isSafeInteger(id) || id < 0) return null
  const fields = p.split(',')
  if (fields.length < 5 || !/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(fields[0])) return null
  const time = Number(fields[0])
  const mode = Number(fields[1])
  const color = /^\d+$/.test(fields[3]) ? Number(fields[3]) : NaN
  const content = text.trim().slice(0, 500)
  if (!Number.isFinite(time) || time < 0 || !Number.isInteger(mode) || mode < 1 || mode > 6) return null
  if (!Number.isSafeInteger(color) || color < 0 || color > 0xffffff || !content) return null
  return { id, time, mode: 1, color: integerToColor(color), text: content }
}

export function parseBilibiliXml(xml: string): DanmakuComment[] {
  if (new TextEncoder().encode(xml).byteLength > MAX_DANMAKU_XML_BYTES) throw new Error('XML file exceeds 12 MB')
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error('DOCTYPE and ENTITY declarations are not allowed')
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  if (document.getElementsByTagName('parsererror').length || document.documentElement?.tagName !== 'i') throw new Error('Invalid Bilibili XML document')
  const result: DanmakuComment[] = []
  for (const [index, node] of Array.from(document.documentElement.getElementsByTagName('d')).entries()) {
    const parsed = parseBilibiliFields(node.getAttribute('p'), node.textContent ?? '', index)
    if (parsed) result.push(parsed)
  }
  return result.sort((left, right) => left.time - right.time)
}

export function parseBilibiliInput(input: string): { bvid: string; page: number } | null {
  const value = input.trim()
  const bvidPattern = /^BV[1-9A-HJ-NP-Za-km-z]{10}$/
  if (bvidPattern.test(value)) return { bvid: value, page: 1 }
  let url: URL
  try { url = new URL(value) } catch { return null }
  if (!/^https?:$/.test(url.protocol) || !/(^|\.)bilibili\.com$/i.test(url.hostname)) return null
  const match = url.pathname.match(/(?:^|\/)video\/(BV[1-9A-HJ-NP-Za-km-z]{10})(?:\.html)?\/?$/)
  if (!match) return null
  const pageText = url.searchParams.get('p')
  const page = pageText === null ? 1 : Number(pageText)
  if (!Number.isSafeInteger(page) || page < 1) return null
  return { bvid: match[1], page }
}
