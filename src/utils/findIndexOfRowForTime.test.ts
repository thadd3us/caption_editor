import { describe, it, expect } from 'vitest'
import { findIndexOfRowForTime } from './captionsUtils'
import type { TranscriptSegment } from '../types/schema'

describe('findIndexOfRowForTime', () => {
  const createCue = (id: string, startTime: number, endTime: number): TranscriptSegment => ({
    id,
    startTime,
    endTime,
    text: `Cue ${id}`
  })

  it('should return -1 for empty cues array', () => {
    expect(findIndexOfRowForTime([], 5.0)).toBe(-1)
  })

  it('should return -1 when time is before all cues', () => {
    const cues = [
      createCue('1', 2.0, 5.0),
      createCue('2', 5.0, 8.0),
      createCue('3', 10.0, 15.0)
    ]
    expect(findIndexOfRowForTime(cues, 1.0)).toBe(-1)
  })

  it('should return index of cue that contains the time', () => {
    const cues = [
      createCue('1', 1.0, 2.0),
      createCue('2', 2.0, 7.0),
      createCue('3', 9.0, 14.0)
    ]

    expect(findIndexOfRowForTime(cues, 1.5)).toBe(0)  // Inside first cue
    expect(findIndexOfRowForTime(cues, 5.0)).toBe(1)  // Inside second cue
    expect(findIndexOfRowForTime(cues, 10.0)).toBe(2) // Inside third cue
  })

  it('should return index of last cue before time when time is in a gap', () => {
    const cues = [
      createCue('1', 1.0, 2.0),
      createCue('2', 2.0, 7.0),
      createCue('3', 9.0, 14.0)
    ]

    expect(findIndexOfRowForTime(cues, 8.5)).toBe(1) // Between second and third cue
    expect(findIndexOfRowForTime(cues, 8.0)).toBe(1) // Right at the gap
  })

  it('should return index of last cue when time is after all cues', () => {
    const cues = [
      createCue('1', 1.0, 2.0),
      createCue('2', 2.0, 7.0),
      createCue('3', 9.0, 14.0)
    ]

    expect(findIndexOfRowForTime(cues, 20.0)).toBe(2) // After all cues
  })

  it('should handle time exactly at cue start boundary', () => {
    const cues = [
      createCue('1', 1.0, 2.0),
      createCue('2', 2.0, 7.0),
      createCue('3', 9.0, 14.0)
    ]

    expect(findIndexOfRowForTime(cues, 1.0)).toBe(0) // Exactly at first cue start
    expect(findIndexOfRowForTime(cues, 2.0)).toBe(1) // Exactly at second cue start
    expect(findIndexOfRowForTime(cues, 9.0)).toBe(2) // Exactly at third cue start
  })

  it('should handle time exactly at cue end boundary (exclusive)', () => {
    const cues = [
      createCue('1', 1.0, 2.0),
      createCue('2', 2.0, 7.0),
      createCue('3', 9.0, 14.0)
    ]

    // End times are exclusive, so 2.0 should match the second cue, not the first
    expect(findIndexOfRowForTime(cues, 2.0)).toBe(1)
    expect(findIndexOfRowForTime(cues, 7.0)).toBe(1) // Right at second cue end
    expect(findIndexOfRowForTime(cues, 14.0)).toBe(2) // Right at third cue end
  })

  it('should work with single cue', () => {
    const cues = [createCue('1', 5.0, 10.0)]

    expect(findIndexOfRowForTime(cues, 3.0)).toBe(-1) // Before cue
    expect(findIndexOfRowForTime(cues, 7.0)).toBe(0)  // Inside cue
    expect(findIndexOfRowForTime(cues, 12.0)).toBe(0) // After cue
  })

  it('should work with adjacent cues (no gaps)', () => {
    const cues = [
      createCue('1', 0.0, 5.0),
      createCue('2', 5.0, 10.0),
      createCue('3', 10.0, 15.0)
    ]

    expect(findIndexOfRowForTime(cues, 4.999)).toBe(0)
    expect(findIndexOfRowForTime(cues, 5.0)).toBe(1)
    expect(findIndexOfRowForTime(cues, 9.999)).toBe(1)
    expect(findIndexOfRowForTime(cues, 10.0)).toBe(2)
  })

  it('should handle fractional seconds', () => {
    const cues = [
      createCue('1', 0.5, 1.5),
      createCue('2', 2.5, 3.5),
      createCue('3', 5.5, 6.5)
    ]

    expect(findIndexOfRowForTime(cues, 0.75)).toBe(0)
    expect(findIndexOfRowForTime(cues, 2.0)).toBe(0) // Between first and second
    expect(findIndexOfRowForTime(cues, 3.0)).toBe(1)
    expect(findIndexOfRowForTime(cues, 4.0)).toBe(1) // Between second and third
  })
})
