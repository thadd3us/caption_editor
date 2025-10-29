/**
 * Immutable VTT caption entry with UUID, timestamps, rating, and text
 */
export interface VTTCue {
  readonly id: string // UUID - cue identifier
  readonly startTime: number // Start time in seconds
  readonly endTime: number // End time in seconds
  readonly text: string // Caption text
  readonly rating?: number // Optional rating 1-5
  readonly timestamp?: string // ISO 8601 timestamp of when the cue was created/last modified
}

/**
 * Complete VTT document with metadata
 */
export interface VTTDocument {
  // TODO: Add a UUID here.
  // TODO: Add an optional path to the media file for which this is a transcript here.  Ideally this path would be relative to the directory containing filePath if possible.  
  readonly cues: readonly VTTCue[]
  readonly filePath?: string // Original file path if loaded from file
  readonly history?: SegmentHistory // Historical record of segment changes

  // TODO: Extract a type called TranscriptMetadata that contains the UUID for the document and the path to the media file.
  // Serialize all that into a top-level NOTE comment in the VTT file, ideally at the top of the file.

  // TODO: Extract a type called TranscriptHistory and serialize/parse that as a NOTE comment at the end of the VTT file.
}

/**
 * Metadata stored in NOTE comments for app-specific data
 */
export interface VTTCueMetadata {
  id: string
  rating?: number
  timestamp?: string
}

/**
 * Result of parsing a VTT file
 */
export interface ParseResult {
  success: boolean
  document?: VTTDocument
  error?: string
}

/**
 * Time range for playback
 */
export interface TimeRange {
  start: number
  end: number
}

/**
 * Historical record of a segment modification or deletion
 */
export interface SegmentHistoryEntry {
  // TODO: Add a UUID here.
  readonly action: 'modified' | 'deleted' // Type of action performed
  readonly actionTimestamp: string // ISO 8601 timestamp of when this action occurred
  readonly cue: VTTCue // The segment's state before the change (preserves the original timestamp)
}

/**
 * Collection of segment history entries
 */
export interface SegmentHistory {
  readonly entries: readonly SegmentHistoryEntry[]
}
