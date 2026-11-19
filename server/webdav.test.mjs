import { describe, it, expect } from 'vitest'
import { safeDecode, basename, normalizePath, joinPath, parsePropfind } from './webdav.mjs'

describe('parsePropfind', () => {
  it('parses collections and files with namespace prefixes', () => {
    const xml = '<?xml version="1.0"?><D:multistatus xmlns:D="DAV:">' +
      '<D:response><D:href>/dav/</D:href><D:propstat><D:prop><D:displayname>dav</D:displayname><D:resourcetype><D:collection/></D:resourcetype></D:prop></D:propstat></D:response>' +
      '<D:response><D:href>/dav/Anime</D:href><D:propstat><D:prop><D:displayname>Anime</D:displayname><D:resourcetype><D:collection/></D:resourcetype></D:prop></D:propstat></D:response>' +
      '<D:response><D:href>/dav/Anime/01.mkv</D:href><D:propstat><D:prop><D:displayname>01.mkv</D:displayname><D:getcontentlength>123456</D:getcontentlength><D:resourcetype/></D:prop></D:propstat></D:response>' +
      '</D:multistatus>'
    const parsed = parsePropfind(xml)
    expect(parsed).toHaveLength(3)
    expect(parsed[0]).toMatchObject({ href: '/dav/', isCollection: true })
    expect(parsed[2]).toMatchObject({ href: '/dav/Anime/01.mkv', size: 123456, isCollection: false })
  })

  it('keeps href raw and decodes via safeDecode', () => {
    const parsed = parsePropfind('<d:multistatus xmlns:d="DAV:"><d:response><d:href>/dav/%E7%95%AA%E5%89%A7/01.mkv</d:href><d:propstat><d:prop><d:getcontentlength>9</d:getcontentlength><d:resourcetype/></d:prop></d:propstat></d:response></d:multistatus>')
    expect(parsed[0].href).toBe('/dav/%E7%95%AA%E5%89%A7/01.mkv')
    expect(safeDecode('/dav/%E7%95%AA%E5%89%A7/01.mkv')).toBe('/dav/番剧/01.mkv')
  })
})

describe('path helpers', () => {
  it('normalizePath', () => {
    expect(normalizePath('')).toBe('/')
    expect(normalizePath('dav/')).toBe('/dav')
    expect(normalizePath('//dav//x/')).toBe('/dav/x')
  })
  it('joinPath', () => {
    expect(joinPath('/dav/', 'Anime')).toBe('/dav/Anime')
    expect(joinPath('/dav', '', 'Anime')).toBe('/dav/Anime')
  })
  it('basename', () => {
    expect(basename('/dav/Anime/01.mkv')).toBe('01.mkv')
    expect(basename('/dav/Anime/')).toBe('Anime')
    expect(basename('01.mkv')).toBe('01.mkv')
  })
  it('safeDecode', () => {
    expect(safeDecode('%20')).toBe(' ')
    expect(safeDecode('%zz')).toBe('%zz')
  })
})
