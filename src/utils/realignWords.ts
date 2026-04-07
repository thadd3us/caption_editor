import type { TranscriptWord } from '../types/schema'

/**
 * Realigns word-level timestamps after user edits the transcript text.
 *
 * Uses a diff algorithm to identify which words were preserved, which were deleted,
 * and which were added. Preserved words keep their original timestamps, while new
 * words get entries without timestamps (startTime/endTime undefined).
 *
 * @param originalWords - Original word sequence with timestamps from ASR
 * @param editedText - User-edited transcript text
 * @returns New word array matching the edited text, preserving timestamps where possible
 *
 * @example
 * const original = [
 *   { text: "Hello", startTime: 1.0, endTime: 1.2 },
 *   { text: "world", startTime: 1.3, endTime: 1.5 }
 * ]
 * const edited = "Hello beautiful world"
 * const result = realignWords(original, edited)
 * // Returns:
 * // [
 * //   { text: "Hello", startTime: 1.0, endTime: 1.2 },   // preserved
 * //   { text: "beautiful" },                              // added (no timestamps)
 * //   { text: "world", startTime: 1.3, endTime: 1.5 }    // preserved
 * // ]
 */
export function realignWords(
  originalWords: readonly TranscriptWord[],
  editedText: string
): TranscriptWord[] {
  // Handle edge cases
  if (originalWords.length === 0 && editedText.trim() === '') {
    return []
  }

  // Tokenize edited text into words
  const editedWords = tokenizeWords(editedText)

  if (editedWords.length === 0) {
    return []
  }

  if (originalWords.length === 0) {
    // No original words, all edited words are new (no timestamps)
    return editedWords.map(text => ({ text }))
  }

  // Use word-level diffing for better matching
  return alignWordsWithDiff(originalWords, editedWords)
}

/**
 * Tokenize text into words (split on whitespace)
 */
function tokenizeWords(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 0)
}

/**
 * Align edited words with original words using LCS (Longest Common Subsequence).
 *
 * This produces a word-level alignment that preserves timestamps for matched words
 * and marks inserted/deleted words appropriately.
 */
function alignWordsWithDiff(
  originalWords: readonly TranscriptWord[],
  editedWords: readonly string[]
): TranscriptWord[] {
  // Compute LCS table for word-level diff
  const lcs = computeLCS(originalWords, editedWords)

  // Backtrack through LCS to build aligned result
  const result: TranscriptWord[] = []
  let i = originalWords.length
  let j = editedWords.length

  const operations: Array<{ type: 'match' | 'insert' | 'delete'; origIndex?: number; editIndex?: number }> = []

  // Backtrack to find edit operations
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && wordsMatch(originalWords[i - 1].text, editedWords[j - 1])) {
      // Words match - record match operation
      operations.unshift({ type: 'match', origIndex: i - 1, editIndex: j - 1 })
      i--
      j--
    } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
      // Word was inserted in edited version
      operations.unshift({ type: 'insert', editIndex: j - 1 })
      j--
    } else if (i > 0) {
      // Word was deleted from original
      operations.unshift({ type: 'delete', origIndex: i - 1 })
      i--
    }
  }

  // Build result from operations
  for (const op of operations) {
    if (op.type === 'match' && op.origIndex !== undefined && op.editIndex !== undefined) {
      const originalWord = originalWords[op.origIndex]
      const editedWord = editedWords[op.editIndex]
      // Preserve timestamp, use edited word's text (for capitalization)
      result.push({
        text: editedWord,
        startTime: originalWord.startTime,
        endTime: originalWord.endTime
      })
    } else if (op.type === 'insert' && op.editIndex !== undefined) {
      // New word without timestamp
      result.push({ text: editedWords[op.editIndex] })
    }
    // Skip deletions - they don't appear in the result
  }

  return result
}

/**
 * Compute LCS table for word-level alignment.
 * Returns a 2D table where lcs[i][j] = length of LCS of original[0..i-1] and edited[0..j-1]
 */
function computeLCS(
  originalWords: readonly TranscriptWord[],
  editedWords: readonly string[]
): number[][] {
  const m = originalWords.length
  const n = editedWords.length
  const lcs: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (wordsMatch(originalWords[i - 1].text, editedWords[j - 1])) {
        lcs[i][j] = lcs[i - 1][j - 1] + 1
      } else {
        lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1])
      }
    }
  }

  return lcs
}

/**
 * Check if two words match (case-insensitive)
 */
function wordsMatch(word1: string, word2: string): boolean {
  return word1.toLowerCase() === word2.toLowerCase()
}
