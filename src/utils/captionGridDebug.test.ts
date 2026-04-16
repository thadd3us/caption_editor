import { describe, it, expect, beforeEach } from 'vitest'
import { isCaptionGridDebugEnabled } from './captionGridDebug'

describe('captionGridDebug', () => {
  beforeEach(() => {
    localStorage.removeItem('captionDebugGrid')
    delete (window as unknown as { __captionGridDebug?: boolean }).__captionGridDebug
  })

  it('is disabled by default', () => {
    expect(isCaptionGridDebugEnabled()).toBe(false)
  })

  it('enables when localStorage captionDebugGrid is 1', () => {
    localStorage.setItem('captionDebugGrid', '1')
    expect(isCaptionGridDebugEnabled()).toBe(true)
  })

  it('enables when window.__captionGridDebug is true', () => {
    ;(window as unknown as { __captionGridDebug: boolean }).__captionGridDebug = true
    expect(isCaptionGridDebugEnabled()).toBe(true)
  })
})
