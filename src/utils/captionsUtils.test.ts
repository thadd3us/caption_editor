import { describe, it, expect } from 'vitest'
import {
  formatTimestamp,
  validateTimestamp,
  createEmptyDocument,
  addCue,
  updateCue,
  deleteCue
} from './captionsUtils'
import type { CaptionsDocument, TranscriptSegment } from '../types/schema'

describe('captionsUtils', () => {
  describe('formatTimestamp', () => {
    it('should format seconds to HH:MM:SS.mmm', () => {
      expect(formatTimestamp(0)).toBe('00:00:00.000')
      expect(formatTimestamp(1.5)).toBe('00:00:01.500')
      expect(formatTimestamp(65.123)).toBe('00:01:05.123')
      expect(formatTimestamp(3665.456)).toBe('01:01:05.456')
    })
  })

  describe('validateTimestamp', () => {
    it('should validate correct timestamps', () => {
      expect(validateTimestamp('00:00:01.000')).toBe(true)
      expect(validateTimestamp('00:01:30.500')).toBe(true)
      expect(validateTimestamp('01:30:45.123')).toBe(true)
      expect(validateTimestamp('01:30.500')).toBe(true) // MM:SS.mmm
      expect(validateTimestamp('59:59.999')).toBe(true) // MM:SS.mmm
      expect(validateTimestamp('12.345')).toBe(true) // seconds-only
    })

    it('should reject invalid formats', () => {
      expect(validateTimestamp('invalid')).toBe(false)
      expect(validateTimestamp('abc:def:ghi')).toBe(false)
    })
  })

  describe('createEmptyDocument', () => {
    it('should create a document with metadata id and empty segments', () => {
      const doc = createEmptyDocument()
      expect(doc.metadata.id).toBeTruthy()
      expect(doc.segments).toEqual([])
    })
  })

  describe('addCue / updateCue / deleteCue', () => {
    function createTestDoc(segments: TranscriptSegment[] = []): CaptionsDocument {
      return {
        metadata: { id: 'doc' },
        segments: Object.freeze(segments)
      }
    }

    it('adds a cue and keeps segments sorted', () => {
      let doc = createTestDoc()
      doc = addCue(doc, { id: 'b', startTime: 5, endTime: 6, text: 'B' })
      doc = addCue(doc, { id: 'a', startTime: 1, endTime: 2, text: 'A' })
      expect(doc.segments.map(s => s.id)).toEqual(['a', 'b'])
    })

    it('updates a cue and records history', () => {
      const doc = createTestDoc([{ id: 'a', startTime: 1, endTime: 2, text: 'A' }])
      const updated = updateCue(doc, 'a', { text: 'A2' })
      expect(updated.segments[0].text).toBe('A2')
      expect(updated.history?.length).toBe(1)
    })

    it('deletes a cue and records history', () => {
      const doc = createTestDoc([{ id: 'a', startTime: 1, endTime: 2, text: 'A' }])
      const updated = deleteCue(doc, 'a')
      expect(updated.segments).toHaveLength(0)
      expect(updated.history?.length).toBe(1)
    })
  })
})

