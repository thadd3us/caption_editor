/**
 * Immutable VTT caption entry with UUID, timestamps, rating, and text
 */
export interface VTTCue {
  readonly id: string // UUID - cue identifier
  readonly startTime: number // Start time in seconds
  readonly endTime: number // End time in seconds
  readonly text: string // Caption text
  readonly rating?: number // Optional rating 1-5
}

/**
 * Complete VTT document with metadata
 */
export interface VTTDocument {
  readonly cues: readonly VTTCue[]
  readonly filePath?: string // Original file path if loaded from file
}

/**
 * Metadata stored in NOTE comments for app-specific data
 */
export interface VTTCueMetadata {
  id: string
  rating?: number
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
