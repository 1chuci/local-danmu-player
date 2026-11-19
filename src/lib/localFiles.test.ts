import { describe, expect, it } from 'vitest'
import { baseName, groupFolderFiles, isSubtitleName, isVideoName, subtitleForVideo } from './localFiles'

const f = (name: string) => ({ name } as File)

describe('isVideoName', () => {
  it('识别常见视频扩展名', () => {
    expect(isVideoName('a.mkv')).toBe(true)
    expect(isVideoName('a.MP4')).toBe(true)
    expect(isVideoName('a.webm')).toBe(true)
    expect(isVideoName('a.avi')).toBe(true)
    expect(isVideoName('a.srt')).toBe(false)
    expect(isVideoName('a.txt')).toBe(false)
  })
})

describe('isSubtitleName', () => {
  it('识别常见字幕扩展名', () => {
    expect(isSubtitleName('a.srt')).toBe(true)
    expect(isSubtitleName('a.ass')).toBe(true)
    expect(isSubtitleName('a.ssa')).toBe(true)
    expect(isSubtitleName('a.vtt')).toBe(true)
    expect(isSubtitleName('a.mkv')).toBe(false)
  })
})

describe('groupFolderFiles + subtitleForVideo', () => {
  it('按 basename 同名匹配字幕，大小写不敏感', () => {
    const group = groupFolderFiles([f('E01.mkv'), f('e01.srt'), f('E02.MKV'), f('E02.ASS'), f('readme.txt')])
    expect(group.videos.map((v) => v.name)).toEqual(['E01.mkv', 'E02.MKV'])
    expect(subtitleForVideo(group, f('E01.mkv'))?.name).toBe('e01.srt')
    expect(subtitleForVideo(group, f('E02.mkv'))?.name).toBe('E02.ASS')
    expect(subtitleForVideo(group, f('E03.mkv'))).toBeUndefined()
  })

})

describe('baseName', () => {
  it('去掉扩展名并转小写', () => {
    expect(baseName('Foo.Bar.Srt')).toBe('foo.bar')
    expect(baseName('noext')).toBe('noext')
  })
})
