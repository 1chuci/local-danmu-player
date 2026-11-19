import { describe, expect, it } from 'vitest'
import { filterSiblingSubtitleEntries } from './sibling-subtitles.mjs'

const entry = (name, isDirectory = false) => ({ name, path: '/Anime/' + name, size: 123, isDirectory })

describe('filterSiblingSubtitleEntries', () => {
  it('lists supported subtitle files with the video basename prefix', () => {
    const result = filterSiblingSubtitleEntries([
      entry('Show S01E01.ass'), entry('Show S01E01.zh-Hans.ass'), entry('Show S01E01.en.srt'),
      entry('Show S01E01.zh.ssa'), entry('Show S01E01.cc.vtt'), entry('Show S01E010.ass'), entry('other.ass'), entry('Show S01E01.txt'), entry('Show S01E01.folder.ass', true),
    ], '/Anime/Show S01E01.mkv')
    expect(result.map(({ name }) => name)).toEqual(['Show S01E01.ass', 'Show S01E01.cc.vtt', 'Show S01E01.en.srt', 'Show S01E01.zh-Hans.ass', 'Show S01E01.zh.ssa'])
  })

  it('matches case-insensitively and keeps exact basename first', () => {
    const result = filterSiblingSubtitleEntries([entry('episode.EN.ASS'), entry('EPISODE.SRT')], '/Anime/Episode.MKV')
    expect(result.map(({ name }) => name)).toEqual(['EPISODE.SRT', 'episode.EN.ASS'])
  })

  it('does not match unrelated prefixes', () => {
    expect(filterSiblingSubtitleEntries([entry('E010.ass'), entry('Other.ass')], '/Anime/E01.mkv')).toEqual([])
  })
})
