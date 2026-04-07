import { describe, it, expect } from 'vitest'
import { splitSegmentAtWord } from './splitSegmentAtWord'
import type { TranscriptSegment } from '../types/schema'

describe('splitSegmentAtWord', () => {
  it('should split a segment at the specified word index', () => {
    const segment: TranscriptSegment = {
      id: 'original-id',
      startTime: 1.0,
      endTime: 5.0,
      text: 'Hello world how are you',
      words: [
        { text: 'Hello', startTime: 1.0, endTime: 1.5 },
        { text: 'world', startTime: 1.6, endTime: 2.0 },
        { text: 'how', startTime: 2.5, endTime: 2.8 },
        { text: 'are', startTime: 3.0, endTime: 3.2 },
        { text: 'you', startTime: 3.5, endTime: 4.0 }
      ],
      speakerName: 'Speaker 1',
      rating: 4
    }

    const result = splitSegmentAtWord(segment, 2) // Split before "how"

    expect(result).not.toBeNull()
    expect(result!.firstSegment).toMatchObject({
      startTime: 1.0,
      endTime: 2.5, // Split at "how" startTime
      text: 'Hello world',
      speakerName: 'Speaker 1',
      rating: 4
    })
    expect(result!.firstSegment.words).toEqual([
      { text: 'Hello', startTime: 1.0, endTime: 1.5 },
      { text: 'world', startTime: 1.6, endTime: 2.0 }
    ])

    expect(result!.secondSegment).toMatchObject({
      startTime: 2.5, // Starts at "how" startTime
      endTime: 5.0,
      text: 'how are you',
      speakerName: 'Speaker 1',
      rating: 4
    })
    expect(result!.secondSegment.words).toEqual([
      { text: 'how', startTime: 2.5, endTime: 2.8 },
      { text: 'are', startTime: 3.0, endTime: 3.2 },
      { text: 'you', startTime: 3.5, endTime: 4.0 }
    ])

    // IDs should be different from original
    expect(result!.firstSegment.id).not.toBe(segment.id)
    expect(result!.secondSegment.id).not.toBe(segment.id)
    expect(result!.firstSegment.id).not.toBe(result!.secondSegment.id)

    // Both segments should have timestamps
    expect(result!.firstSegment.timestamp).toBeDefined()
    expect(result!.secondSegment.timestamp).toBeDefined()
  })

  it('should return null if segment has no words', () => {
    const segment: TranscriptSegment = {
      id: 'seg-1',
      startTime: 1.0,
      endTime: 5.0,
      text: 'Hello world'
    }

    const result = splitSegmentAtWord(segment, 1)
    expect(result).toBeNull()
  })

  it('should return null if words array is empty', () => {
    const segment: TranscriptSegment = {
      id: 'seg-1',
      startTime: 1.0,
      endTime: 5.0,
      text: 'Hello world',
      words: []
    }

    const result = splitSegmentAtWord(segment, 1)
    expect(result).toBeNull()
  })

  it('should return null if wordIndex is 0 (cannot split before first word)', () => {
    const segment: TranscriptSegment = {
      id: 'seg-1',
      startTime: 1.0,
      endTime: 5.0,
      text: 'Hello world',
      words: [
        { text: 'Hello', startTime: 1.0, endTime: 1.5 },
        { text: 'world', startTime: 1.6, endTime: 2.0 }
      ]
    }

    const result = splitSegmentAtWord(segment, 0)
    expect(result).toBeNull()
  })

  it('should return null if wordIndex is out of range', () => {
    const segment: TranscriptSegment = {
      id: 'seg-1',
      startTime: 1.0,
      endTime: 5.0,
      text: 'Hello world',
      words: [
        { text: 'Hello', startTime: 1.0, endTime: 1.5 },
        { text: 'world', startTime: 1.6, endTime: 2.0 }
      ]
    }

    const result = splitSegmentAtWord(segment, 2) // Index 2 is out of range
    expect(result).toBeNull()
  })

  it('should return null if word at index has no startTime', () => {
    const segment: TranscriptSegment = {
      id: 'seg-1',
      startTime: 1.0,
      endTime: 5.0,
      text: 'Hello world',
      words: [
        { text: 'Hello', startTime: 1.0, endTime: 1.5 },
        { text: 'world' } // No timestamp (user-added word)
      ]
    }

    const result = splitSegmentAtWord(segment, 1)
    expect(result).toBeNull()
  })

  it('should handle split at first word with timestamp', () => {
    const segment: TranscriptSegment = {
      id: 'seg-1',
      startTime: 1.0,
      endTime: 5.0,
      text: 'Hello beautiful world',
      words: [
        { text: 'Hello', startTime: 1.0, endTime: 1.5 },
        { text: 'beautiful', startTime: 2.0, endTime: 2.5 },
        { text: 'world', startTime: 3.0, endTime: 3.5 }
      ]
    }

    const result = splitSegmentAtWord(segment, 1)

    expect(result).not.toBeNull()
    expect(result!.firstSegment.text).toBe('Hello')
    expect(result!.secondSegment.text).toBe('beautiful world')
    expect(result!.firstSegment.endTime).toBe(2.0)
    expect(result!.secondSegment.startTime).toBe(2.0)
  })

  it('should handle split at last word with timestamp', () => {
    const segment: TranscriptSegment = {
      id: 'seg-1',
      startTime: 1.0,
      endTime: 5.0,
      text: 'Hello beautiful world',
      words: [
        { text: 'Hello', startTime: 1.0, endTime: 1.5 },
        { text: 'beautiful', startTime: 2.0, endTime: 2.5 },
        { text: 'world', startTime: 3.0, endTime: 3.5 }
      ]
    }

    const result = splitSegmentAtWord(segment, 2)

    expect(result).not.toBeNull()
    expect(result!.firstSegment.text).toBe('Hello beautiful')
    expect(result!.secondSegment.text).toBe('world')
    expect(result!.firstSegment.endTime).toBe(3.0)
    expect(result!.secondSegment.startTime).toBe(3.0)
  })

  it('should preserve speaker metadata in both segments', () => {
    const segment: TranscriptSegment = {
      id: 'seg-1',
      startTime: 1.0,
      endTime: 5.0,
      text: 'Hello world',
      words: [
        { text: 'Hello', startTime: 1.0, endTime: 1.5 },
        { text: 'world', startTime: 2.0, endTime: 2.5 }
      ],
      speakerName: 'Alice',
      rating: 5
    }

    const result = splitSegmentAtWord(segment, 1)

    expect(result).not.toBeNull()
    expect(result!.firstSegment.speakerName).toBe('Alice')
    expect(result!.firstSegment.rating).toBe(5)
    expect(result!.secondSegment.speakerName).toBe('Alice')
    expect(result!.secondSegment.rating).toBe(5)
  })

  it('should return null if split time is at segment start boundary', () => {
    const segment: TranscriptSegment = {
      id: 'seg-1',
      startTime: 1.0,
      endTime: 5.0,
      text: 'Hello world',
      words: [
        { text: 'Hello', startTime: 1.0, endTime: 1.5 }, // Same as segment start
        { text: 'world', startTime: 2.0, endTime: 2.5 }
      ]
    }

    const result = splitSegmentAtWord(segment, 0)
    expect(result).toBeNull() // wordIndex 0 is not allowed
  })

  it('should return null if split time is at segment end boundary', () => {
    const segment: TranscriptSegment = {
      id: 'seg-1',
      startTime: 1.0,
      endTime: 5.0,
      text: 'Hello world',
      words: [
        { text: 'Hello', startTime: 1.0, endTime: 1.5 },
        { text: 'world', startTime: 5.0, endTime: 5.5 } // startTime at segment end
      ]
    }

    const result = splitSegmentAtWord(segment, 1)
    expect(result).toBeNull()
  })

  it('should handle words with only some timestamps', () => {
    const segment: TranscriptSegment = {
      id: 'seg-1',
      startTime: 1.0,
      endTime: 5.0,
      text: 'Hello beautiful world today',
      words: [
        { text: 'Hello', startTime: 1.0, endTime: 1.5 },
        { text: 'beautiful' }, // No timestamp (user-added)
        { text: 'world', startTime: 3.0, endTime: 3.5 },
        { text: 'today' } // No timestamp (user-added)
      ]
    }

    // Split at word with timestamp
    const result = splitSegmentAtWord(segment, 2)

    expect(result).not.toBeNull()
    expect(result!.firstSegment.text).toBe('Hello beautiful')
    expect(result!.secondSegment.text).toBe('world today')
    expect(result!.firstSegment.words).toEqual([
      { text: 'Hello', startTime: 1.0, endTime: 1.5 },
      { text: 'beautiful' }
    ])
    expect(result!.secondSegment.words).toEqual([
      { text: 'world', startTime: 3.0, endTime: 3.5 },
      { text: 'today' }
    ])
  })

  it('should handle single-word segments (cannot split)', () => {
    const segment: TranscriptSegment = {
      id: 'seg-1',
      startTime: 1.0,
      endTime: 2.0,
      text: 'Hello',
      words: [
        { text: 'Hello', startTime: 1.0, endTime: 1.5 }
      ]
    }

    const result = splitSegmentAtWord(segment, 1) // Out of range
    expect(result).toBeNull()
  })
})
