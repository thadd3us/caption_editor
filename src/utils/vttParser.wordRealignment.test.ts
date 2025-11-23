import { describe, it, expect } from 'vitest'
import { updateCue, createEmptyDocument, addCue } from './vttParser'
import type { TranscriptSegment, VTTDocument } from '../types/schema'

describe('updateCue - word realignment', () => {
  it('should realign words when text is edited', () => {
    // Create a document with a segment that has word-level timestamps
    let doc: VTTDocument = createEmptyDocument()

    const segment: TranscriptSegment = {
      id: 'test-1',
      startTime: 59.84,
      endTime: 66.8,
      text: 'the courtesy of your home is somewhat listened of late fair little king',
      words: [
        { text: 'the', startTime: 59.84, endTime: 60.08 },
        { text: 'courtesy', startTime: 60.08, endTime: 60.88 },
        { text: 'of', startTime: 60.96, endTime: 61.12 },
        { text: 'your', startTime: 61.28, endTime: 61.52 },
        { text: 'home', startTime: 61.52, endTime: 61.92 },
        { text: 'is', startTime: 62.08, endTime: 62.32 },
        { text: 'somewhat', startTime: 62.32, endTime: 62.8 },
        { text: 'listened', startTime: 62.96, endTime: 63.68 },
        { text: 'of', startTime: 63.68, endTime: 63.92 },
        { text: 'late', startTime: 63.92, endTime: 64.48 },
        { text: 'fair', startTime: 65.28, endTime: 65.6 },
        { text: 'little', startTime: 65.84, endTime: 66 },
        { text: 'king', startTime: 66.16, endTime: 66.8 }
      ],
      speakerName: 'Gandalf',
      timestamp: '2025-11-23T02:35:30.342-08:00'
    }

    doc = addCue(doc, segment)

    // Edit the text - change "fair little king" to "Theoden King" (removing 2 words, adding 1)
    const updatedDoc = updateCue(doc, 'test-1', {
      text: 'the courtesy of your home is somewhat listened of late Theoden King'
    })

    const updatedSegment = updatedDoc.segments[0]

    // Verify text was updated
    expect(updatedSegment.text).toBe('the courtesy of your home is somewhat listened of late Theoden King')

    // Verify words array was updated
    expect(updatedSegment.words).toBeDefined()
    expect(updatedSegment.words).toHaveLength(12) // 10 preserved words + 2 new words

    // Verify preserved words kept their timestamps
    expect(updatedSegment.words![0]).toEqual({ text: 'the', startTime: 59.84, endTime: 60.08 })
    expect(updatedSegment.words![1]).toEqual({ text: 'courtesy', startTime: 60.08, endTime: 60.88 })
    expect(updatedSegment.words![9]).toEqual({ text: 'late', startTime: 63.92, endTime: 64.48 })

    // Verify new word doesn't have timestamps
    expect(updatedSegment.words![10]).toEqual({ text: 'Theoden' })

    // Verify last word kept its timestamp (case-insensitive match: "king" -> "King")
    expect(updatedSegment.words![11]).toEqual({ text: 'King', startTime: 66.16, endTime: 66.8 })
  })

  it('should handle text edits with no original words', () => {
    let doc: VTTDocument = createEmptyDocument()

    const segment: TranscriptSegment = {
      id: 'test-1',
      startTime: 10,
      endTime: 15,
      text: 'original text',
      // No words array
      timestamp: '2025-11-23T02:35:30.342-08:00'
    }

    doc = addCue(doc, segment)

    // Edit the text
    const updatedDoc = updateCue(doc, 'test-1', { text: 'new edited text' })

    const updatedSegment = updatedDoc.segments[0]

    // Verify text was updated
    expect(updatedSegment.text).toBe('new edited text')

    // Since there were no original words, the words array should be undefined
    expect(updatedSegment.words).toBeUndefined()
  })

  it('should preserve words when only speaker name is updated', () => {
    let doc: VTTDocument = createEmptyDocument()

    const segment: TranscriptSegment = {
      id: 'test-1',
      startTime: 10,
      endTime: 15,
      text: 'hello world',
      words: [
        { text: 'hello', startTime: 10.0, endTime: 10.5 },
        { text: 'world', startTime: 10.6, endTime: 11.0 }
      ],
      timestamp: '2025-11-23T02:35:30.342-08:00'
    }

    doc = addCue(doc, segment)

    // Update only speaker name (not text)
    const updatedDoc = updateCue(doc, 'test-1', { speakerName: 'Alice' })

    const updatedSegment = updatedDoc.segments[0]

    // Verify text and words are unchanged
    expect(updatedSegment.text).toBe('hello world')
    expect(updatedSegment.words).toEqual([
      { text: 'hello', startTime: 10.0, endTime: 10.5 },
      { text: 'world', startTime: 10.6, endTime: 11.0 }
    ])

    // Verify speaker name was updated
    expect(updatedSegment.speakerName).toBe('Alice')
  })
})
