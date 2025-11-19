import { v4 as uuidv4 } from 'uuid'
import type { TranscriptSegment } from '../types/schema'
import { getCurrentTimestamp } from './vttParser'

/**
 * Result of splitting a segment at a word boundary
 */
export interface SplitSegmentResult {
  firstSegment: TranscriptSegment
  secondSegment: TranscriptSegment
}

/**
 * Split a segment at a specific word index.
 *
 * The split creates two new segments:
 * 1. First segment: Contains words from index 0 to wordIndex-1
 * 2. Second segment: Contains words from wordIndex to end
 *
 * The split point is determined by the startTime of the word at wordIndex.
 * If the word doesn't have a startTime, the function returns null.
 *
 * @param segment - The segment to split
 * @param wordIndex - Index of the word where the second segment should start (0-based)
 * @returns Object with firstSegment and secondSegment, or null if split is not possible
 */
export function splitSegmentAtWord(
  segment: TranscriptSegment,
  wordIndex: number
): SplitSegmentResult | null {
  // Validate inputs
  if (!segment.words || segment.words.length === 0) {
    console.warn('Cannot split segment: no words array')
    return null
  }

  if (wordIndex <= 0 || wordIndex >= segment.words.length) {
    console.warn('Cannot split segment: wordIndex out of range', { wordIndex, wordCount: segment.words.length })
    return null
  }

  const splitWord = segment.words[wordIndex]
  if (splitWord.startTime === undefined) {
    console.warn('Cannot split segment: word at index has no startTime', { wordIndex, word: splitWord })
    return null
  }

  const splitTime = splitWord.startTime

  // Validate that splitTime is within segment bounds
  if (splitTime <= segment.startTime || splitTime >= segment.endTime) {
    console.warn('Cannot split segment: split time outside segment bounds', {
      splitTime,
      segmentStart: segment.startTime,
      segmentEnd: segment.endTime
    })
    return null
  }

  // Split the words array
  const firstWords = segment.words.slice(0, wordIndex)
  const secondWords = segment.words.slice(wordIndex)

  // Reconstruct text from words for each segment
  const firstText = firstWords.map(w => w.text).join(' ')
  const secondText = secondWords.map(w => w.text).join(' ')

  const now = getCurrentTimestamp()

  // Create first segment
  const firstSegment: TranscriptSegment = {
    ...segment,
    id: uuidv4(),
    endTime: splitTime,
    text: firstText,
    words: firstWords,
    timestamp: now
  }

  // Create second segment
  const secondSegment: TranscriptSegment = {
    ...segment,
    id: uuidv4(),
    startTime: splitTime,
    text: secondText,
    words: secondWords,
    timestamp: now
  }

  return { firstSegment, secondSegment }
}
