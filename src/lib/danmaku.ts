import type { DanmakuComment, RawComment } from '../types'

export function integerToColor(value: number) {
  const normalized = Math.max(0, Math.min(0xffffff, value || 0xffffff))
  return `#${normalized.toString(16).padStart(6, '0')}`
}

export function parseComments(comments: RawComment[]): DanmakuComment[] {
  return comments
    .map((comment) => {
      const [time, mode, color] = String(comment.p || '').split(',')
      return {
        id: comment.cid,
        time: Number(time),
        mode: Number(mode),
        color: integerToColor(Number(color)),
        text: String(comment.m || '').trim(),
      }
    })
    .filter((comment) => Number.isFinite(comment.time) && comment.time >= 0 && comment.text)
    .sort((left, right) => left.time - right.time)
}

export const demoComments: DanmakuComment[] = [
  { id: -1, time: 1, mode: 1, color: '#ffffff', text: '欢迎体验本地弹幕播放器' },
  { id: -2, time: 3.5, mode: 5, color: '#ffd166', text: '视频文件不会上传到服务器' },
  { id: -3, time: 6, mode: 1, color: '#72ddf7', text: '审核通过后将自动匹配真实弹幕' },
  { id: -4, time: 9, mode: 4, color: '#caffbf', text: '右下角可以调整弹幕显示效果' },
  { id: -5, time: 12, mode: 1, color: '#ffadad', text: '点击 +80 秒可快速跳过片头' },
]
