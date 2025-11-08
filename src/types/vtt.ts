/**
 * Immutable VTT caption entry with UUID, timestamps, rating, and text
 */
export interface VTTCue {
  readonly id: string // UUID - cue identifier
  readonly startTime: number // Start time in seconds
  readonly endTime: number // End time in seconds
  readonly text: string // Caption text
  readonly speakerName?: string // Optional speaker name
  readonly rating?: number // Optional rating 1-5
  readonly timestamp?: string // ISO 8601 timestamp of when the cue was created/last modified
}

/**
 * Metadata for the transcript document
 */
export interface TranscriptMetadata {
  readonly id: string // UUID for the document
  readonly mediaFilePath?: string // Optional path to the media file (relative to VTT file directory if possible)
}

/**
 * Complete VTT document with metadata
 */
export interface VTTDocument {
  readonly metadata: TranscriptMetadata // Document metadata (id, media file path)
  readonly cues: readonly VTTCue[]
  readonly filePath?: string // Original file path if loaded from file
  readonly history?: readonly SegmentHistoryEntry[] // Historical record of segment changes
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
  readonly id: string // UUID for this history entry
  readonly action: 'modified' | 'deleted' // Type of action performed
  readonly actionTimestamp: string // ISO 8601 timestamp of when this action occurred
  readonly cue: VTTCue // The segment's state before the change (preserves the original timestamp)
}
