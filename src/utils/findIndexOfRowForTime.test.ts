import { describe, it, expect } from 'vitest'
import { findIndexOfRowForTime } from './captionsUtils'
import type { TranscriptSegment } from '../types/schema'

describe('findIndexOfRowForTime', () => {
  const createSegment = (id: string, startTime: number, endTime: number): TranscriptSegment => ({
    id,
    startTime,
    endTime,
    text: `Segment ${id}`
  })

  it('should return -1 for empty segments array', () => {
    expect(findIndexOfRowForTime([], 5.0)).toBe(-1)
  })

  it('should return -1 when time is before all segments', () => {
    const segments = [
      createSegment('1', 2.0, 5.0),
      createSegment('2', 5.0, 8.0),
      createSegment('3', 10.0, 15.0)
    ]
    expect(findIndexOfRowForTime(segments, 1.0)).toBe(-1)
  })

  it('should return index of segment that contains the time', () => {
    const segments = [
      createSegment('1', 1.0, 2.0),
      createSegment('2', 2.0, 7.0),
      createSegment('3', 9.0, 14.0)
    ]

    expect(findIndexOfRowForTime(segments, 1.5)).toBe(0)  // Inside first segment
    expect(findIndexOfRowForTime(segments, 5.0)).toBe(1)  // Inside second segment
    expect(findIndexOfRowForTime(segments, 10.0)).toBe(2) // Inside third segment
  })

  it('should return index of last segment before time when time is in a gap', () => {
    const segments = [
      createSegment('1', 1.0, 2.0),
      createSegment('2', 2.0, 7.0),
      createSegment('3', 9.0, 14.0)
    ]

    expect(findIndexOfRowForTime(segments, 8.5)).toBe(1) // Between second and third segment
    expect(findIndexOfRowForTime(segments, 8.0)).toBe(1) // Right at the gap
  })

  it('should return index of last segment when time is after all segments', () => {
    const segments = [
      createSegment('1', 1.0, 2.0),
      createSegment('2', 2.0, 7.0),
      createSegment('3', 9.0, 14.0)
    ]

    expect(findIndexOfRowForTime(segments, 20.0)).toBe(2) // After all segments
  })

  it('should handle time exactly at segment start boundary', () => {
    const segments = [
      createSegment('1', 1.0, 2.0),
      createSegment('2', 2.0, 7.0),
      createSegment('3', 9.0, 14.0)
    ]

    expect(findIndexOfRowForTime(segments, 1.0)).toBe(0) // Exactly at first segment start
    expect(findIndexOfRowForTime(segments, 2.0)).toBe(1) // Exactly at second segment start
    expect(findIndexOfRowForTime(segments, 9.0)).toBe(2) // Exactly at third segment start
  })

  it('should handle time exactly at segment end boundary (exclusive)', () => {
    const segments = [
      createSegment('1', 1.0, 2.0),
      createSegment('2', 2.0, 7.0),
      createSegment('3', 9.0, 14.0)
    ]

    // End times are exclusive, so 2.0 should match the second segment, not the first
    expect(findIndexOfRowForTime(segments, 2.0)).toBe(1)
    expect(findIndexOfRowForTime(segments, 7.0)).toBe(1) // Right at second segment end
    expect(findIndexOfRowForTime(segments, 14.0)).toBe(2) // Right at third segment end
  })

  it('should work with single segment', () => {
    const segments = [createSegment('1', 5.0, 10.0)]

    expect(findIndexOfRowForTime(segments, 3.0)).toBe(-1) // Before segment
    expect(findIndexOfRowForTime(segments, 7.0)).toBe(0)  // Inside segment
    expect(findIndexOfRowForTime(segments, 12.0)).toBe(0) // After segment
  })

  it('should work with adjacent segments (no gaps)', () => {
    const segments = [
      createSegment('1', 0.0, 5.0),
      createSegment('2', 5.0, 10.0),
      createSegment('3', 10.0, 15.0)
    ]

    expect(findIndexOfRowForTime(segments, 4.999)).toBe(0)
    expect(findIndexOfRowForTime(segments, 5.0)).toBe(1)
    expect(findIndexOfRowForTime(segments, 9.999)).toBe(1)
    expect(findIndexOfRowForTime(segments, 10.0)).toBe(2)
  })

  it('should handle fractional seconds', () => {
    const segments = [
      createSegment('1', 0.5, 1.5),
      createSegment('2', 2.5, 3.5),
      createSegment('3', 5.5, 6.5)
    ]

    expect(findIndexOfRowForTime(segments, 0.75)).toBe(0)
    expect(findIndexOfRowForTime(segments, 2.0)).toBe(0) // Between first and second
    expect(findIndexOfRowForTime(segments, 3.0)).toBe(1)
    expect(findIndexOfRowForTime(segments, 4.0)).toBe(1) // Between second and third
  })
})
