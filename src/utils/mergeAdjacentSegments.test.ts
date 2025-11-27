import { describe, it, expect } from 'vitest'
import { mergeAdjacentSegments } from './vttParser'
import type { VTTDocument, TranscriptSegment } from '../types/schema'

describe('mergeAdjacentSegments', () => {
  // Helper function to create a test document with segments
  function createTestDocument(segments: TranscriptSegment[]): VTTDocument {
    // Sort segments (ordinals are computed at runtime, not stored)
    const sortedSegments = [...segments].sort((a, b) => {
      if (a.startTime !== b.startTime) {
        return a.startTime - b.startTime
      }
      return a.endTime - b.endTime
    })

    return {
      metadata: { id: 'test-doc' },
      segments: Object.freeze(sortedSegments)
    }
  }

  it('should merge two adjacent segments', () => {
    const doc = createTestDocument([
      {
        id: 'seg1',
        startTime: 0,
        endTime: 5,
        text: 'Hello',
        rating: 3
      },
      {
        id: 'seg2',
        startTime: 5,
        endTime: 10,
        text: 'world',
        rating: 5
      }
    ])

    const result = mergeAdjacentSegments(doc, ['seg1', 'seg2'])

    expect(result.segments).toHaveLength(1)
    expect(result.segments[0].text).toBe('Hello world')
    expect(result.segments[0].startTime).toBe(0)
    expect(result.segments[0].endTime).toBe(10)
    expect(result.segments[0].rating).toBe(5) // highest rating
  })

  it('should merge three adjacent segments', () => {
    const doc = createTestDocument([
      {
        id: 'seg1',
        startTime: 0,
        endTime: 5,
        text: 'One'
      },
      {
        id: 'seg2',
        startTime: 5,
        endTime: 10,
        text: 'Two'
      },
      {
        id: 'seg3',
        startTime: 10,
        endTime: 15,
        text: 'Three'
      }
    ])

    const result = mergeAdjacentSegments(doc, ['seg1', 'seg2', 'seg3'])

    expect(result.segments).toHaveLength(1)
    expect(result.segments[0].text).toBe('One Two Three')
    expect(result.segments[0].startTime).toBe(0)
    expect(result.segments[0].endTime).toBe(15)
  })

  it('should not merge non-adjacent segments', () => {
    const doc = createTestDocument([
      {
        id: 'seg1',
        startTime: 0,
        endTime: 5,
        text: 'One'
      },
      {
        id: 'seg2',
        startTime: 5,
        endTime: 10,
        text: 'Two'
      },
      {
        id: 'seg3',
        startTime: 10,
        endTime: 15,
        text: 'Three'
      }
    ])

    // Try to merge seg1 and seg3 (skipping seg2)
    const result = mergeAdjacentSegments(doc, ['seg1', 'seg3'])

    // Should return original document unchanged
    expect(result.segments).toHaveLength(3)
  })

  it('should preserve word-level timestamps when merging', () => {
    const doc = createTestDocument([
      {
        id: 'seg1',
        startTime: 0,
        endTime: 5,
        text: 'Hello',
        words: [
          { text: 'Hello', startTime: 0, endTime: 2 }
        ]
      },
      {
        id: 'seg2',
        startTime: 5,
        endTime: 10,
        text: 'world',
        words: [
          { text: 'world', startTime: 5, endTime: 8 }
        ]
      }
    ])

    const result = mergeAdjacentSegments(doc, ['seg1', 'seg2'])

    expect(result.segments).toHaveLength(1)
    expect(result.segments[0].words).toHaveLength(2)
    expect(result.segments[0].words?.[0]).toEqual({ text: 'Hello', startTime: 0, endTime: 2 })
    expect(result.segments[0].words?.[1]).toEqual({ text: 'world', startTime: 5, endTime: 8 })
  })

  it('should use first non-empty speaker name', () => {
    const doc = createTestDocument([
      {
        id: 'seg1',
        startTime: 0,
        endTime: 5,
        text: 'Hello',
        speakerName: undefined
      },
      {
        id: 'seg2',
        startTime: 5,
        endTime: 10,
        text: 'world',
        speakerName: 'Alice'
      },
      {
        id: 'seg3',
        startTime: 10,
        endTime: 15,
        text: 'everyone',
        speakerName: 'Bob'
      }
    ])

    const result = mergeAdjacentSegments(doc, ['seg1', 'seg2', 'seg3'])

    expect(result.segments).toHaveLength(1)
    expect(result.segments[0].speakerName).toBe('Alice')
  })

  it('should take highest rating among all segments', () => {
    const doc = createTestDocument([
      {
        id: 'seg1',
        startTime: 0,
        endTime: 5,
        text: 'One',
        rating: 2
      },
      {
        id: 'seg2',
        startTime: 5,
        endTime: 10,
        text: 'Two',
        rating: 5
      },
      {
        id: 'seg3',
        startTime: 10,
        endTime: 15,
        text: 'Three',
        rating: 3
      }
    ])

    const result = mergeAdjacentSegments(doc, ['seg1', 'seg2', 'seg3'])

    expect(result.segments).toHaveLength(1)
    expect(result.segments[0].rating).toBe(5)
  })

  it('should handle segments without ratings', () => {
    const doc = createTestDocument([
      {
        id: 'seg1',
        startTime: 0,
        endTime: 5,
        text: 'One'
      },
      {
        id: 'seg2',
        startTime: 5,
        endTime: 10,
        text: 'Two'
      }
    ])

    const result = mergeAdjacentSegments(doc, ['seg1', 'seg2'])

    expect(result.segments).toHaveLength(1)
    expect(result.segments[0].rating).toBeUndefined()
  })

  it('should return original document if less than 2 segments provided', () => {
    const doc = createTestDocument([
      {
        id: 'seg1',
        startTime: 0,
        endTime: 5,
        text: 'One'
      }
    ])

    const result = mergeAdjacentSegments(doc, ['seg1'])

    expect(result.segments).toHaveLength(1)
    expect(result).toBe(doc) // should be unchanged
  })

  it('should return original document if segment not found', () => {
    const doc = createTestDocument([
      {
        id: 'seg1',
        startTime: 0,
        endTime: 5,
        text: 'One'
      }
    ])

    const result = mergeAdjacentSegments(doc, ['seg1', 'nonexistent'])

    expect(result).toBe(doc) // should be unchanged
  })

  it('should add history entries for all merged segments', () => {
    const doc = createTestDocument([
      {
        id: 'seg1',
        startTime: 0,
        endTime: 5,
        text: 'One'
      },
      {
        id: 'seg2',
        startTime: 5,
        endTime: 10,
        text: 'Two'
      }
    ])

    const result = mergeAdjacentSegments(doc, ['seg1', 'seg2'])

    // Should have 2 history entries (one for each merged segment)
    expect(result.history).toBeDefined()
    expect(result.history).toHaveLength(2)
  })

  it('should work with segments in any order', () => {
    const doc = createTestDocument([
      {
        id: 'seg1',
        startTime: 0,
        endTime: 5,
        text: 'One'
      },
      {
        id: 'seg2',
        startTime: 5,
        endTime: 10,
        text: 'Two'
      },
      {
        id: 'seg3',
        startTime: 10,
        endTime: 15,
        text: 'Three'
      }
    ])

    // Provide IDs in reverse order
    const result = mergeAdjacentSegments(doc, ['seg3', 'seg1', 'seg2'])

    expect(result.segments).toHaveLength(1)
    expect(result.segments[0].text).toBe('One Two Three')
  })
})
