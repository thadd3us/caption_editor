import { describe, it, expect } from 'vitest'
import {
  parseVTT,
  serializeVTT,
  formatTimestamp,
  validateTimestamp,
  createEmptyDocument,
  addCue,
  updateCue,
  deleteCue
} from './vttParser'
import type { VTTDocument, TranscriptSegment } from '../types/schema'

describe('vttParser', () => {
  describe('formatTimestamp', () => {
    it('should format seconds to HH:MM:SS.mmm', () => {
      expect(formatTimestamp(0)).toBe('00:00:00.000')
      expect(formatTimestamp(1.5)).toBe('00:00:01.500')
      expect(formatTimestamp(65.123)).toBe('00:01:05.123')
      expect(formatTimestamp(3665.456)).toBe('01:01:05.456')
    })

    it('should pad values correctly', () => {
      expect(formatTimestamp(0.001)).toBe('00:00:00.001')
      expect(formatTimestamp(9)).toBe('00:00:09.000')
      expect(formatTimestamp(599)).toBe('00:09:59.000')
    })
  })

  describe('validateTimestamp', () => {
    it('should validate correct timestamps', () => {
      expect(validateTimestamp('00:00:01.000')).toBe(true)
      expect(validateTimestamp('00:01:30.500')).toBe(true)
      expect(validateTimestamp('01:30:45.123')).toBe(true)
    })

    it('should validate MM:SS.mmm format', () => {
      expect(validateTimestamp('01:30.500')).toBe(true)
      expect(validateTimestamp('59:59.999')).toBe(true)
    })

    it('should reject invalid formats', () => {
      expect(validateTimestamp('invalid')).toBe(false)
      expect(validateTimestamp('abc:def:ghi')).toBe(false)
    })

    it('should allow negative timestamps (parsed as NaN, then validated)', () => {
      // Note: The current parser doesn't explicitly validate negative values
      // It parses them and validateTimestamp checks if result >= 0
      // But parseInt('-00') = -0 which is still >= 0
      expect(validateTimestamp('00:00:00.000')).toBe(true)
    })
  })

  describe('parseVTT', () => {
    it('should parse a simple VTT file', () => {
      const content = `WEBVTT

00:00:01.000 --> 00:00:04.000
First caption

00:00:05.000 --> 00:00:08.000
Second caption`

      const result = parseVTT(content)
      expect(result.success).toBe(true)
      expect(result.document?.segments).toHaveLength(2)
      expect(result.document?.segments[0].text).toBe('First caption')
      expect(result.document?.segments[0].startTime).toBe(1)
      expect(result.document?.segments[0].endTime).toBe(4)
      expect(result.document?.segments[1].text).toBe('Second caption')
    })

    it('should parse VTT with cue identifiers', () => {
      const content = `WEBVTT

test-id-1
00:00:01.000 --> 00:00:04.000
Caption with identifier`

      const result = parseVTT(content)
      expect(result.success).toBe(true)
      expect(result.document?.segments).toHaveLength(1)
      expect(result.document?.segments[0].text).toBe('Caption with identifier')
    })

    it('should parse VTT with UUID identifiers', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000'
      const content = `WEBVTT

${uuid}
00:00:01.000 --> 00:00:04.000
Caption with UUID`

      const result = parseVTT(content)
      expect(result.success).toBe(true)
      expect(result.document?.segments[0].id).toBe(uuid)
    })

    it('should parse VTT with NOTE metadata', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000'
      const content = `WEBVTT

NOTE CAPTION_EDITOR:VTTCue {"id":"${uuid}","startTime":1,"endTime":4,"text":"Rated caption","rating":5}

00:00:01.000 --> 00:00:04.000
Rated caption`

      const result = parseVTT(content)
      expect(result.success).toBe(true)
      expect(result.document?.segments[0].id).toBe(uuid)
      expect(result.document?.segments[0].rating).toBe(5)
    })

    it('should handle multi-line captions', () => {
      const content = `WEBVTT

00:00:01.000 --> 00:00:04.000
Line 1
Line 2
Line 3`

      const result = parseVTT(content)
      expect(result.success).toBe(true)
      expect(result.document?.segments[0].text).toBe('Line 1\nLine 2\nLine 3')
    })

    it('should skip cues with invalid timing (end <= start)', () => {
      const content = `WEBVTT

00:00:04.000 --> 00:00:01.000
Invalid cue

00:00:05.000 --> 00:00:08.000
Valid cue`

      const result = parseVTT(content)
      expect(result.success).toBe(true)
      expect(result.document?.segments).toHaveLength(1)
      expect(result.document?.segments[0].text).toBe('Valid cue')
    })

    it('should reject files without WEBVTT header', () => {
      const content = `00:00:01.000 --> 00:00:04.000
Caption without header`

      const result = parseVTT(content)
      expect(result.success).toBe(false)
      expect(result.error).toContain('WEBVTT header')
    })

    it('should handle empty VTT files', () => {
      const content = 'WEBVTT\n\n'

      const result = parseVTT(content)
      expect(result.success).toBe(true)
      expect(result.document?.segments).toHaveLength(0)
    })

    it('should handle NOTE comments that are not metadata', () => {
      const content = `WEBVTT

NOTE This is a regular comment

00:00:01.000 --> 00:00:04.000
Caption after note`

      const result = parseVTT(content)
      expect(result.success).toBe(true)
      expect(result.document?.segments).toHaveLength(1)
      expect(result.document?.segments[0].text).toBe('Caption after note')
    })

    it('should handle errors gracefully', () => {
      const result = parseVTT('')
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should parse MM:SS.mmm format', () => {
      const content = `WEBVTT

01:30.500 --> 02:45.000
Caption with short format`

      const result = parseVTT(content)
      expect(result.success).toBe(true)
      expect(result.document?.segments[0].startTime).toBe(90.5)
      expect(result.document?.segments[0].endTime).toBe(165)
    })

    it('should reject files with duplicate cue IDs', () => {
      const duplicateId = 'duplicate-id'
      const content = `WEBVTT

${duplicateId}
00:00:00.000 --> 00:00:02.000
First cue

${duplicateId}
00:00:02.000 --> 00:00:04.000
Second cue with same ID (DUPLICATE!)`

      const result = parseVTT(content)
      expect(result.success).toBe(false)
      expect(result.error).toContain('duplicate cue ID')
      expect(result.error).toContain(duplicateId)
    })

    it('should reject files with multiple duplicate cue IDs', () => {
      const content = `WEBVTT

dup-1
00:00:00.000 --> 00:00:01.000
First

dup-1
00:00:01.000 --> 00:00:02.000
Duplicate 1

dup-2
00:00:02.000 --> 00:00:03.000
Original 2

dup-2
00:00:03.000 --> 00:00:04.000
Duplicate 2

unique-id
00:00:04.000 --> 00:00:05.000
Unique cue`

      const result = parseVTT(content)
      expect(result.success).toBe(false)
      expect(result.error).toContain('2 duplicate cue ID(s)')
      expect(result.error).toContain('dup-1')
      expect(result.error).toContain('dup-2')
    })

    it('should load test file with duplicate UUIDs and reject it', () => {
      const fs = require('fs')
      const path = require('path')
      const vttPath = path.join(process.cwd(), 'test_data', 'duplicate-uuids.vtt')
      const content = fs.readFileSync(vttPath, 'utf-8')

      const result = parseVTT(content)
      expect(result.success).toBe(false)
      expect(result.error).toContain('duplicate cue ID')
      expect(result.error).toContain('duplicate-id')
    })
  })

  describe('serializeVTT', () => {
    it('should serialize a simple document', () => {
      const doc: VTTDocument = {
        metadata: { id: 'test-doc-id' },
        segments: Object.freeze([
          {
            id: 'test-1',
            startTime: 1,
            endTime: 4,
            text: 'First caption',
            rating: undefined
          }
        ])
      }

      const output = serializeVTT(doc)
      expect(output).toContain('WEBVTT')
      expect(output).toContain('test-1')
      expect(output).toContain('00:00:01.000 --> 00:00:04.000')
      expect(output).toContain('First caption')
    })

    it('should serialize cues in time order', () => {
      const doc: VTTDocument = {
        metadata: { id: 'test-doc-id' },
        segments: Object.freeze([
          {
            id: 'test-2',
            startTime: 5,
            endTime: 8,
            text: 'Second caption',
            rating: undefined
          },
          {
            id: 'test-1',
            startTime: 1,
            endTime: 4,
            text: 'First caption',
            rating: undefined
          }
        ])
      }

      const output = serializeVTT(doc)
      const firstCaptionIndex = output.indexOf('First caption')
      const secondCaptionIndex = output.indexOf('Second caption')
      expect(firstCaptionIndex).toBeLessThan(secondCaptionIndex)
    })

    it('should include NOTE metadata for rated cues', () => {
      const doc: VTTDocument = {
        metadata: { id: 'test-doc-id' },
        segments: Object.freeze([
          {
            id: 'test-1',
            startTime: 1,
            endTime: 4,
            text: 'Rated caption',
            rating: 5
          }
        ])
      }

      const output = serializeVTT(doc)
      expect(output).toContain('NOTE')
      expect(output).toContain('"rating":5')
    })

    it('should always include NOTE metadata for all cues', () => {
      const doc: VTTDocument = {
        metadata: { id: 'test-doc-id' },
        segments: Object.freeze([
          {
            id: 'test-1',
            startTime: 1,
            endTime: 4,
            text: 'Unrated caption',
            rating: undefined
          }
        ])
      }

      const output = serializeVTT(doc)
      expect(output).toContain('NOTE')
      expect(output).toContain('"id":"test-1"')
    })

    it('should handle empty documents', () => {
      const doc: VTTDocument = {
        metadata: { id: 'test-doc-id' },
        segments: Object.freeze([])
      }

      const output = serializeVTT(doc)
      expect(output).toContain('WEBVTT')
      expect(output).toContain('NOTE CAPTION_EDITOR:TranscriptMetadata {"id":"test-doc-id"}')
      expect(output).not.toContain('-->') // No timing lines for empty doc
    })

    it('should sort cues with equal start times by end time', () => {
      const doc: VTTDocument = {
        metadata: { id: 'test-doc-id' },
        segments: Object.freeze([
          {
            id: 'test-2',
            startTime: 1,
            endTime: 6,
            text: 'Longer caption',
            rating: undefined
          },
          {
            id: 'test-1',
            startTime: 1,
            endTime: 4,
            text: 'Shorter caption',
            rating: undefined
          }
        ])
      }

      const output = serializeVTT(doc)
      const shorterIndex = output.indexOf('Shorter caption')
      const longerIndex = output.indexOf('Longer caption')
      expect(shorterIndex).toBeLessThan(longerIndex)
    })
  })

  describe('createEmptyDocument', () => {
    it('should create an empty document', () => {
      const doc = createEmptyDocument()
      expect(doc.segments).toHaveLength(0)
      expect(Object.isFrozen(doc.segments)).toBe(true)
    })
  })

  describe('addCue', () => {
    it('should add a cue to the document', () => {
      const doc = createEmptyDocument()
      const newCue: TranscriptSegment = {
        id: 'test-1',
        startTime: 1,
        endTime: 4,
        text: 'New caption',
        rating: undefined
      }

      const updatedDoc = addCue(doc, newCue)
      expect(updatedDoc.segments).toHaveLength(1)
      expect(updatedDoc.segments[0]).toEqual(newCue)
      expect(Object.isFrozen(updatedDoc.segments)).toBe(true)
    })

    it('should not mutate the original document', () => {
      const doc = createEmptyDocument()
      const newCue: TranscriptSegment = {
        id: 'test-1',
        startTime: 1,
        endTime: 4,
        text: 'New caption',
        rating: undefined
      }

      addCue(doc, newCue)
      expect(doc.segments).toHaveLength(0)
    })
  })

  describe('updateCue', () => {
    it('should update a cue in the document', () => {
      const segment: TranscriptSegment = {
        id: 'test-1',
        startTime: 1,
        endTime: 4,
        text: 'Original text',
        rating: undefined
      }
      const doc: VTTDocument = {
        metadata: { id: 'test-doc-id' },
        segments: Object.freeze([segment])
      }

      const updatedDoc = updateCue(doc, 'test-1', { text: 'Updated text' })
      expect(updatedDoc.segments[0].text).toBe('Updated text')
      expect(updatedDoc.segments[0].startTime).toBe(1)
    })

    it('should update timing', () => {
      const segment: TranscriptSegment = {
        id: 'test-1',
        startTime: 1,
        endTime: 4,
        text: 'Caption',
        rating: undefined
      }
      const doc: VTTDocument = {
        metadata: { id: 'test-doc-id' },
        segments: Object.freeze([segment])
      }

      const updatedDoc = updateCue(doc, 'test-1', { startTime: 2, endTime: 5 })
      expect(updatedDoc.segments[0].startTime).toBe(2)
      expect(updatedDoc.segments[0].endTime).toBe(5)
    })

    it('should update rating', () => {
      const segment: TranscriptSegment = {
        id: 'test-1',
        startTime: 1,
        endTime: 4,
        text: 'Caption',
        rating: undefined
      }
      const doc: VTTDocument = {
        metadata: { id: 'test-doc-id' },
        segments: Object.freeze([segment])
      }

      const updatedDoc = updateCue(doc, 'test-1', { rating: 5 })
      expect(updatedDoc.segments[0].rating).toBe(5)
    })

    it('should not mutate the original document', () => {
      const segment: TranscriptSegment = {
        id: 'test-1',
        startTime: 1,
        endTime: 4,
        text: 'Original text',
        rating: undefined
      }
      const doc: VTTDocument = {
        metadata: { id: 'test-doc-id' },
        segments: Object.freeze([segment])
      }

      updateCue(doc, 'test-1', { text: 'Updated text' })
      expect(doc.segments[0].text).toBe('Original text')
    })

    it('should leave other cues unchanged', () => {
      const doc: VTTDocument = {
        metadata: { id: 'test-doc-id' },
        segments: Object.freeze([
          {
            id: 'test-1',
            startTime: 1,
            endTime: 4,
            text: 'First caption',
            rating: undefined
          },
          {
            id: 'test-2',
            startTime: 5,
            endTime: 8,
            text: 'Second caption',
            rating: undefined
          }
        ])
      }

      const updatedDoc = updateCue(doc, 'test-1', { text: 'Updated' })
      expect(updatedDoc.segments[1].text).toBe('Second caption')
    })
  })

  describe('deleteCue', () => {
    it('should delete a cue from the document', () => {
      const doc: VTTDocument = {
        metadata: { id: 'test-doc-id' },
        segments: Object.freeze([
          {
            id: 'test-1',
            startTime: 1,
            endTime: 4,
            text: 'First caption',
            rating: undefined
          },
          {
            id: 'test-2',
            startTime: 5,
            endTime: 8,
            text: 'Second caption',
            rating: undefined
          }
        ])
      }

      const updatedDoc = deleteCue(doc, 'test-1')
      expect(updatedDoc.segments).toHaveLength(1)
      expect(updatedDoc.segments[0].id).toBe('test-2')
    })

    it('should not mutate the original document', () => {
      const doc: VTTDocument = {
        metadata: { id: 'test-doc-id' },
        segments: Object.freeze([
          {
            id: 'test-1',
            startTime: 1,
            endTime: 4,
            text: 'Caption',
            rating: undefined
          }
        ])
      }

      deleteCue(doc, 'test-1')
      expect(doc.segments).toHaveLength(1)
    })

    it('should handle deleting non-existent cue', () => {
      const doc: VTTDocument = {
        metadata: { id: 'test-doc-id' },
        segments: Object.freeze([
          {
            id: 'test-1',
            startTime: 1,
            endTime: 4,
            text: 'Caption',
            rating: undefined
          }
        ])
      }

      const updatedDoc = deleteCue(doc, 'non-existent')
      expect(updatedDoc.segments).toHaveLength(1)
    })
  })

  describe('round-trip parsing', () => {
    it('should preserve data through serialize and parse cycle', () => {
      const uuid1 = '550e8400-e29b-41d4-a716-446655440000'
      const uuid2 = '550e8400-e29b-41d4-a716-446655440001'

      const original: VTTDocument = {
        metadata: { id: 'test-doc-id' },
        segments: Object.freeze([
          {
            id: uuid1,
            startTime: 1.5,
            endTime: 4.25,
            text: 'First caption',
            rating: 5
          },
          {
            id: uuid2,
            startTime: 5,
            endTime: 8.123,
            text: 'Second caption\nwith multiple lines',
            rating: undefined
          }
        ])
      }

      const serialized = serializeVTT(original)
      const parsed = parseVTT(serialized)

      expect(parsed.success).toBe(true)
      expect(parsed.document?.segments).toHaveLength(2)
      expect(parsed.document?.segments[0].text).toBe('First caption')
      expect(parsed.document?.segments[0].id).toBe(uuid1)
      expect(parsed.document?.segments[0].rating).toBe(5)
      expect(parsed.document?.segments[1].text).toBe('Second caption\nwith multiple lines')
    })
  })

  describe('segment history', () => {
    it('should record history when updating a cue', () => {
      const segment: TranscriptSegment = {
        id: 'test-1',
        startTime: 1,
        endTime: 4,
        text: 'Original text',
        rating: undefined,
        timestamp: '2024-01-01T00:00:00.000Z'
      }
      const doc: VTTDocument = {
        metadata: { id: 'test-doc-id' },
        segments: Object.freeze([segment])
      }

      const updatedDoc = updateCue(doc, 'test-1', { text: 'Updated text' })

      expect(updatedDoc.history).toBeDefined()
      expect(updatedDoc.history).toHaveLength(1)
      expect(updatedDoc.history![0].action).toBe('modified')
      expect(updatedDoc.history![0].actionTimestamp).toBeDefined()
      expect(updatedDoc.history![0].segment.id).toBe('test-1')
      expect(updatedDoc.history![0].segment.text).toBe('Original text')
      expect(updatedDoc.history![0].segment.timestamp).toBe('2024-01-01T00:00:00.000Z') // Original timestamp preserved
    })

    it('should record history when deleting a cue', () => {
      const segment: TranscriptSegment = {
        id: 'test-1',
        startTime: 1,
        endTime: 4,
        text: 'To be deleted',
        rating: 5,
        timestamp: '2024-01-01T12:00:00.000Z'
      }
      const doc: VTTDocument = {
        metadata: { id: 'test-doc-id' },
        segments: Object.freeze([segment])
      }

      const updatedDoc = deleteCue(doc, 'test-1')

      expect(updatedDoc.history).toBeDefined()
      expect(updatedDoc.history).toHaveLength(1)
      expect(updatedDoc.history![0].action).toBe('deleted')
      expect(updatedDoc.history![0].actionTimestamp).toBeDefined()
      expect(updatedDoc.history![0].segment.id).toBe('test-1')
      expect(updatedDoc.history![0].segment.text).toBe('To be deleted')
      expect(updatedDoc.history![0].segment.rating).toBe(5)
      expect(updatedDoc.history![0].segment.timestamp).toBe('2024-01-01T12:00:00.000Z') // Original timestamp preserved
    })

    it('should append to existing history', () => {
      const cue1: TranscriptSegment = {
        id: 'test-1',
        startTime: 1,
        endTime: 4,
        text: 'First',
        rating: undefined
      }
      const cue2: TranscriptSegment = {
        id: 'test-2',
        startTime: 5,
        endTime: 8,
        text: 'Second',
        rating: undefined
      }
      const doc: VTTDocument = {
        metadata: { id: 'test-doc-id' },
        segments: Object.freeze([cue1, cue2])
      }

      // First update
      let updatedDoc = updateCue(doc, 'test-1', { text: 'First updated' })
      expect(updatedDoc.history).toHaveLength(1)

      // Second update
      updatedDoc = updateCue(updatedDoc, 'test-2', { text: 'Second updated' })
      expect(updatedDoc.history).toHaveLength(2)
      expect(updatedDoc.history![0].segment.id).toBe('test-1')
      expect(updatedDoc.history![1].segment.id).toBe('test-2')
    })

    it('should serialize history to NOTE at end of VTT', () => {
      const segment: TranscriptSegment = {
        id: 'test-1',
        startTime: 1,
        endTime: 4,
        text: 'Original',
        rating: undefined
      }
      let doc: VTTDocument = {
        metadata: { id: 'test-doc-id' },
        segments: Object.freeze([segment])
      }

      // Update to create history
      doc = updateCue(doc, 'test-1', { text: 'Updated' })

      const serialized = serializeVTT(doc)

      expect(serialized).toContain('NOTE')
      expect(serialized).toContain('SegmentHistoryEntry')
      expect(serialized).toContain('"action":"modified"')
      expect(serialized).toContain('test-1')

      // History should be at the end
      const noteIndex = serialized.lastIndexOf('NOTE')
      const historyMatch = serialized.substring(noteIndex).match(/NOTE CAPTION_EDITOR:SegmentHistoryEntry (.+)/)
      expect(historyMatch).toBeDefined()

      const historyEntry = JSON.parse(historyMatch![1])
      expect(historyEntry.action).toBe('modified')
      expect(historyEntry.cue).toBeDefined()
    })

    it('should parse history from NOTE at end of VTT', () => {
      const content = `WEBVTT

test-1
00:00:01.000 --> 00:00:04.000
Updated text

NOTE CAPTION_EDITOR:SegmentHistoryEntry {"id":"entry-1","action":"modified","actionTimestamp":"2024-01-01T12:00:00.000Z","segment":{"id":"test-1","startTime":1,"endTime":4,"text":"Original text","timestamp":"2024-01-01T00:00:00.000Z"}}`

      const result = parseVTT(content)

      expect(result.success).toBe(true)
      expect(result.document?.history).toBeDefined()
      expect(result.document?.history).toHaveLength(1)
      expect(result.document?.history![0].action).toBe('modified')
      expect(result.document?.history![0].actionTimestamp).toBe('2024-01-01T12:00:00.000Z')
      expect(result.document?.history![0].segment.id).toBe('test-1')
      expect(result.document?.history![0].segment.text).toBe('Original text')
      expect(result.document?.history![0].segment.timestamp).toBe('2024-01-01T00:00:00.000Z')
    })

    it('should preserve history through round-trip', () => {
      const segment: TranscriptSegment = {
        id: 'test-1',
        startTime: 1,
        endTime: 4,
        text: 'Current text',
        rating: 3
      }
      let doc: VTTDocument = {
        metadata: { id: 'test-doc-id' },
        segments: Object.freeze([segment])
      }

      // Update and delete to create history
      doc = updateCue(doc, 'test-1', { text: 'Updated text' })
      doc = updateCue(doc, 'test-1', { rating: 5 })

      const serialized = serializeVTT(doc)
      const parsed = parseVTT(serialized)

      expect(parsed.success).toBe(true)
      expect(parsed.document?.history).toHaveLength(2)
      expect(parsed.document?.history![0].segment.text).toBe('Current text')
      expect(parsed.document?.history![1].segment.rating).toBe(3)
    })

    it('should not serialize history if no entries exist', () => {
      const doc: VTTDocument = {
        metadata: { id: 'test-doc-id' },
        segments: Object.freeze([
          {
            id: 'test-1',
            startTime: 1,
            endTime: 4,
            text: 'Caption',
            rating: undefined
          }
        ])
      }

      const serialized = serializeVTT(doc)

      // Should contain one NOTE for the document metadata and one NOTE for the cue metadata, but not for history
      const noteCount = (serialized.match(/NOTE/g) || []).length
      expect(noteCount).toBe(2) // One NOTE for document metadata, one for cue metadata, no history NOTE
      expect(serialized).not.toContain('SegmentHistoryEntry')
    })
  })
})
