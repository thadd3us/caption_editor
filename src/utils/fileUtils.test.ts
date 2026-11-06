import { describe, it, expect } from 'vitest'
import { sidecarName, findBackupPath, mediaUrlForPath, pathFromMediaUrl } from './fileUtils'

describe('sidecarName', () => {
  it('should replace extension with .captions_json5', () => {
    expect(sidecarName('/path/to/video.mp4')).toBe('/path/to/video.captions_json5')
  })

  it('should handle .wav files', () => {
    expect(sidecarName('/Users/thad/media/lotr_trailer.wav')).toBe('/Users/thad/media/lotr_trailer.captions_json5')
  })

  it('should handle files with multiple dots', () => {
    expect(sidecarName('/path/to/my.cool.video.mp4')).toBe('/path/to/my.cool.video.captions_json5')
  })

  it('should return null for null/undefined', () => {
    expect(sidecarName(null)).toBeNull()
    expect(sidecarName(undefined)).toBeNull()
  })

  it('should return null for empty string', () => {
    expect(sidecarName('')).toBeNull()
  })

  it('should return null for dotfile with no extension', () => {
    expect(sidecarName('.hidden')).toBeNull()
  })

  it('should handle file with no path', () => {
    expect(sidecarName('video.mp4')).toBe('video.captions_json5')
  })
})

describe('mediaUrlForPath / pathFromMediaUrl', () => {
  /**
   * The characters in this list are the whole point of the encoding. Before it,
   * `media://local${filePath}` put them straight into the URL, so `#` started a
   * fragment, `?` started a query, and a bare `%` made the decode throw — the
   * protocol handler then stat'd a path that did not exist and the player showed
   * nothing, with no error anywhere the user could see.
   */
  const paths = [
    '/Users/me/Music/plain.mp3',
    '/Users/me/Music/track #3.mp3',
    '/Users/me/a?b/c.mp4',
    '/Users/me/100% live.wav',
    '/Users/me/café/naïve.mp3',
    '/Users/me/two  spaces.wav',
    '/Users/me/semi;colon&amp.mov',
    '/Users/me/quote\'s "and" more.m4a',
    '/Users/me/plus+hash#both%.flac',
  ]

  it.each(paths)('round-trips %s', (p) => {
    expect(pathFromMediaUrl(mediaUrlForPath(p))).toBe(p)
  })

  it('produces a parseable URL whose host is local', () => {
    const url = new URL(mediaUrlForPath('/Users/me/track #3.mp3'))
    expect(url.protocol).toBe('media:')
    expect(url.host).toBe('local')
    expect(url.hash).toBe('')
    expect(url.search).toBe('')
  })

  it('leaves unreserved characters unescaped so URLs stay readable', () => {
    expect(mediaUrlForPath('/Users/me/plain.mp3')).toBe('media://local/Users/me/plain.mp3')
  })

  it('normalises Windows separators and keeps the drive letter recoverable', () => {
    const url = mediaUrlForPath('C:\\Media\\clip #1.mp4')
    expect(url).toBe('media://local/C%3A/Media/clip%20%231.mp4')
    // electron/main.ts strips the leading slash on win32, leaving a path Node accepts.
    expect(pathFromMediaUrl(url)).toBe('/C:/Media/clip #1.mp4')
  })

  it('adds a leading slash to a relative path', () => {
    expect(pathFromMediaUrl(mediaUrlForPath('rel/a.mp3'))).toBe('/rel/a.mp3')
  })
})

describe('findBackupPath', () => {
  it('should return .bak when nothing exists', async () => {
    const result = await findBackupPath('/path/file.captions_json5', async () => false)
    expect(result).toBe('/path/file.captions_json5.bak')
  })

  it('should return .bak2 when .bak exists', async () => {
    const existing = new Set(['/path/file.captions_json5.bak'])
    const result = await findBackupPath('/path/file.captions_json5', async (p) => existing.has(p))
    expect(result).toBe('/path/file.captions_json5.bak2')
  })

  it('should return .bak3 when .bak and .bak2 exist', async () => {
    const existing = new Set([
      '/path/file.captions_json5.bak',
      '/path/file.captions_json5.bak2'
    ])
    const result = await findBackupPath('/path/file.captions_json5', async (p) => existing.has(p))
    expect(result).toBe('/path/file.captions_json5.bak3')
  })

  it('should skip to first available slot', async () => {
    const existing = new Set([
      '/path/file.captions_json5.bak',
      '/path/file.captions_json5.bak2',
      '/path/file.captions_json5.bak3',
      '/path/file.captions_json5.bak4',
    ])
    const result = await findBackupPath('/path/file.captions_json5', async (p) => existing.has(p))
    expect(result).toBe('/path/file.captions_json5.bak5')
  })
})
