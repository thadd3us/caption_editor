import { v4 as uuidv4 } from 'uuid'
import type {
  TranscriptSegment,
  TranscriptWord,
  CaptionsDocument,
  SegmentHistoryEntry
} from '../types/schema'
import { HistoryAction } from '../types/schema'
import { splitSegmentAtWord } from './splitSegmentAtWord'
import { realignWords } from './realignWords'

/**
 * Get current timestamp in ISO 8601 format with local timezone.
 */
export function getCurrentTimestamp(): string {
  const now = new Date()
  const offset = -now.getTimezoneOffset()
  const offsetHours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')
  const offsetMinutes = String(Math.abs(offset) % 60).padStart(2, '0')
  const offsetSign = offset >= 0 ? '+' : '-'

  // Get ISO string without the 'Z' and append timezone offset
  return now.toISOString().slice(0, -1) + offsetSign + offsetHours + ':' + offsetMinutes
}

/**
 * Parse timestamp in format HH:MM:SS.mmm, MM:SS.mmm, or ssss.000 to seconds.
 */
function parseTimestamp(timestamp: string): number {
  const parts = timestamp.split(':')
  let seconds = 0

  if (parts.length === 3) {
    // HH:MM:SS.mmm
    seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2])
  } else if (parts.length === 2) {
    // MM:SS.mmm
    seconds = parseInt(parts[0]) * 60 + parseFloat(parts[1])
  } else if (parts.length === 1) {
    // ssss.000 (simple seconds format)
    seconds = parseFloat(parts[0])
  } else {
    throw new Error(`Invalid timestamp format: ${timestamp}`)
  }

  return seconds
}

/**
 * Format seconds to VTT-style timestamp HH:MM:SS.mmm (used for UI and exports).
 */
export function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  const h = hours.toString().padStart(2, '0')
  const m = minutes.toString().padStart(2, '0')
  const s = secs.toFixed(3).padStart(6, '0')

  return `${h}:${m}:${s}`
}

/**
 * Format seconds to simple seconds display ssss.000 (for UI display).
 */
export function formatTimestampSimple(seconds: number): string {
  return seconds.toFixed(3)
}

/**
 * Validate timestamp format and range.
 */
export function validateTimestamp(timestamp: string): boolean {
  try {
    const seconds = parseTimestamp(timestamp)
    return seconds >= 0
  } catch {
    return false
  }
}

/**
 * Create a new empty captions document.
 */
export function createEmptyDocument(): CaptionsDocument {
  return {
    metadata: { id: uuidv4() },
    segments: Object.freeze([])
  }
}

/**
 * Sort segments by start time, then end time.
 */
function sortSegments(segments: readonly TranscriptSegment[]): readonly TranscriptSegment[] {
  const sorted = [...segments].sort((a, b) => {
    if (a.startTime !== b.startTime) {
      return a.startTime - b.startTime
    }
    return a.endTime - b.endTime
  })
  return Object.freeze(sorted)
}

/**
 * Compute ordinal indices for segments based on their position in a sorted array.
 * Returns a map of segment ID to ordinal index.
 */
export function computeSegmentOrdinals(
  segments: readonly TranscriptSegment[]
): Map<string, number> {
  const ordinalMap = new Map<string, number>()
  segments.forEach((segment, index) => {
    ordinalMap.set(segment.id, index)
  })
  return ordinalMap
}

/**
 * Find the index of the segment that should be selected for a given time.
 * Returns the index of the segment that contains the time, or the last segment before it.
 * Returns -1 if there are no segments or if time is before all segments.
 */
export function findIndexOfRowForTime(
  segments: readonly TranscriptSegment[],
  time: number
): number {
  if (segments.length === 0) {
    return -1
  }

  // Find the segment that contains the current time
  const indexAtTime = segments.findIndex(
    segment => segment.startTime <= time && time < segment.endTime
  )

  if (indexAtTime !== -1) {
    return indexAtTime
  }

  // If no segment contains the time, find the last segment before it
  let lastIndexBefore = -1
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i].startTime <= time) {
      lastIndexBefore = i
      break
    }
  }

  return lastIndexBefore
}

/**
 * Add a history entry to the document.
 */
function addHistoryEntry(
  document: CaptionsDocument,
  segment: TranscriptSegment,
  action: HistoryAction
): CaptionsDocument {
  const newEntry: SegmentHistoryEntry = {
    id: uuidv4(),
    action,
    actionTimestamp: getCurrentTimestamp(),
    segment // Preserve the original segment state including its original timestamp
  }

  const existingEntries = document.history || []
  const newHistory = Object.freeze([...existingEntries, newEntry])

  return {
    ...document,
    history: newHistory
  }
}

/**
 * Add a new segment to the document (returns new document with sorted segments).
 */
export function addCue(document: CaptionsDocument, segment: TranscriptSegment): CaptionsDocument {
  return {
    ...document,
    segments: sortSegments([...document.segments, segment])
  }
}

/**
 * Update an existing cue (returns new document with sorted cues).
 * Records the previous state in history and sets timestamp on updated cue.
 */
export function updateCue(
  document: CaptionsDocument,
  cueId: string,
  updates: Partial<Omit<TranscriptSegment, 'id'>>
): CaptionsDocument {
  // Find the original cue to save to history
  const originalCue = document.segments.find(cue => cue.id === cueId)
  if (!originalCue) {
    return document
  }

  // If text is being updated and the cue has words, realign the words
  let finalUpdates = updates
  if (updates.text !== undefined && originalCue.words && originalCue.words.length > 0) {
    const realignedWords = realignWords(originalCue.words, updates.text)
    finalUpdates = {
      ...updates,
      words: realignedWords.length > 0 ? realignedWords : undefined
    }
  }

  // Update the cues with new timestamp
  const currentTimestamp = getCurrentTimestamp()
  const updatedCues = document.segments.map(cue =>
    cue.id === cueId
      ? { ...cue, ...finalUpdates, timestamp: currentTimestamp }
      : cue
  )

  // Create document with updated cues
  let newDocument: CaptionsDocument = {
    ...document,
    segments: sortSegments(updatedCues)
  }

  // Add history entry (with the original cue before modification)
  newDocument = addHistoryEntry(newDocument, originalCue, HistoryAction.Modified)

  return newDocument
}

/**
 * Delete a cue (returns new document).
 * Records the deleted cue in history.
 */
export function deleteCue(document: CaptionsDocument, cueId: string): CaptionsDocument {
  // Find the cue to save to history before deleting
  const deletedCue = document.segments.find(cue => cue.id === cueId)
  if (!deletedCue) {
    return document
  }

  // Create document with cue removed
  let newDocument: CaptionsDocument = {
    ...document,
    segments: Object.freeze(document.segments.filter(cue => cue.id !== cueId))
  }

  // Add history entry
  newDocument = addHistoryEntry(newDocument, deletedCue, HistoryAction.Deleted)

  return newDocument
}

/**
 * Rename all occurrences of a speaker name (returns new document).
 * Records all modified cues in history.
 */
export function renameSpeaker(
  document: CaptionsDocument,
  oldName: string,
  newName: string
): CaptionsDocument {
  const currentTimestamp = getCurrentTimestamp()
  let newDocument = document

  // Find all cues with the old speaker name and add history entries
  for (const cue of document.segments) {
    if (cue.speakerName === oldName) {
      newDocument = addHistoryEntry(newDocument, cue, HistoryAction.SpeakerRenamed)
    }
  }

  // Update all cues with the new speaker name
  const updatedCues = newDocument.segments.map(cue =>
    cue.speakerName === oldName
      ? { ...cue, speakerName: newName, timestamp: currentTimestamp }
      : cue
  )

  return {
    ...newDocument,
    segments: Object.freeze(updatedCues)
  }
}

/**
 * Split a segment at a word boundary (returns new document).
 * Replaces the original segment with two new segments.
 * Records the original segment in history.
 */
export function splitSegment(
  document: CaptionsDocument,
  segmentId: string,
  wordIndex: number
): CaptionsDocument {
  // Find the segment to split
  const segment = document.segments.find(s => s.id === segmentId)
  if (!segment) {
    return document
  }

  const result = splitSegmentAtWord(segment, wordIndex)
  if (!result) {
    return document
  }

  // Remove the original segment and add the two new segments
  const segmentsWithoutOriginal = document.segments.filter(s => s.id !== segmentId)
  const newSegments = [...segmentsWithoutOriginal, result.firstSegment, result.secondSegment]

  // Create new document with sorted segments
  let newDocument: CaptionsDocument = {
    ...document,
    segments: sortSegments(newSegments)
  }

  // Add history entry for the original segment (before split)
  newDocument = addHistoryEntry(newDocument, segment, HistoryAction.Modified)

  return newDocument
}

/**
 * Merge multiple adjacent segments into a single segment (returns new document).
 */
export function mergeAdjacentSegments(
  document: CaptionsDocument,
  segmentIds: string[]
): CaptionsDocument {
  if (segmentIds.length < 2) {
    return document
  }

  const segmentsToMerge = segmentIds
    .map(id => document.segments.find(s => s.id === id))
    .filter((s): s is TranscriptSegment => s !== undefined)

  if (segmentsToMerge.length !== segmentIds.length) {
    return document
  }

  // Compute ordinal map for the document's segments
  const ordinalMap = computeSegmentOrdinals(document.segments)

  // Sort segments by their ordinal index
  const sortedSegments = [...segmentsToMerge].sort((a, b) => {
    const ordinalA = ordinalMap.get(a.id) ?? 0
    const ordinalB = ordinalMap.get(b.id) ?? 0
    return ordinalA - ordinalB
  })

  // Check if segments are adjacent based on ordinal indices
  for (let i = 0; i < sortedSegments.length - 1; i++) {
    const currentOrdinal = ordinalMap.get(sortedSegments[i].id) ?? 0
    const nextOrdinal = ordinalMap.get(sortedSegments[i + 1].id) ?? 0
    if (nextOrdinal !== currentOrdinal + 1) {
      return document
    }
  }

  // Concatenate all words from all segments
  const allWords: TranscriptWord[] = []
  for (const segment of sortedSegments) {
    if (segment.words && segment.words.length > 0) {
      allWords.push(...segment.words)
    }
  }

  // Find the highest rating
  const ratings = sortedSegments.map(s => s.rating).filter((r): r is number => r !== undefined)
  const highestRating = ratings.length > 0 ? Math.max(...ratings) : undefined

  // Find the first non-empty speaker label
  const speakerName = sortedSegments.find(s => s.speakerName)?.speakerName

  // Create merged segment
  const mergedSegment: TranscriptSegment = {
    id: uuidv4(),
    startTime: sortedSegments[0].startTime,
    endTime: sortedSegments[sortedSegments.length - 1].endTime,
    text: sortedSegments.map(s => s.text).join(' '),
    words: allWords.length > 0 ? allWords : undefined,
    speakerName,
    rating: highestRating,
    timestamp: getCurrentTimestamp()
  }

  // Remove all original segments
  const segmentIdsSet = new Set(segmentIds)
  const remainingSegments = document.segments.filter(s => !segmentIdsSet.has(s.id))

  // Add merged segment
  const newSegments = [...remainingSegments, mergedSegment]

  // Create new document with sorted segments
  let newDocument: CaptionsDocument = {
    ...document,
    segments: sortSegments(newSegments)
  }

  // Add history entries for all original segments
  for (const segment of sortedSegments) {
    newDocument = addHistoryEntry(newDocument, segment, HistoryAction.Modified)
  }

  return newDocument
}

