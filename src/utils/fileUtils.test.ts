import { describe, it, expect } from 'vitest'
import { sidecarName, findBackupPath } from './fileUtils'

describe('sidecarName', () => {
  it('should replace extension with .captions_json', () => {
    expect(sidecarName('/path/to/video.mp4')).toBe('/path/to/video.captions_json')
  })

  it('should handle .wav files', () => {
    expect(sidecarName('/Users/thad/media/lotr_trailer.wav')).toBe('/Users/thad/media/lotr_trailer.captions_json')
  })

  it('should handle files with multiple dots', () => {
    expect(sidecarName('/path/to/my.cool.video.mp4')).toBe('/path/to/my.cool.video.captions_json')
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
    expect(sidecarName('video.mp4')).toBe('video.captions_json')
  })
})

describe('findBackupPath', () => {
  it('should return .bak when nothing exists', async () => {
    const result = await findBackupPath('/path/file.captions_json', async () => false)
    expect(result).toBe('/path/file.captions_json.bak')
  })

  it('should return .bak2 when .bak exists', async () => {
    const existing = new Set(['/path/file.captions_json.bak'])
    const result = await findBackupPath('/path/file.captions_json', async (p) => existing.has(p))
    expect(result).toBe('/path/file.captions_json.bak2')
  })

  it('should return .bak3 when .bak and .bak2 exist', async () => {
    const existing = new Set([
      '/path/file.captions_json.bak',
      '/path/file.captions_json.bak2'
    ])
    const result = await findBackupPath('/path/file.captions_json', async (p) => existing.has(p))
    expect(result).toBe('/path/file.captions_json.bak3')
  })

  it('should skip to first available slot', async () => {
    const existing = new Set([
      '/path/file.captions_json.bak',
      '/path/file.captions_json.bak2',
      '/path/file.captions_json.bak3',
      '/path/file.captions_json.bak4',
    ])
    const result = await findBackupPath('/path/file.captions_json', async (p) => existing.has(p))
    expect(result).toBe('/path/file.captions_json.bak5')
  })
})
