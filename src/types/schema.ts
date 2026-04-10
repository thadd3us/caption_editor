/**
 * TypeScript/Python Schema Sync
 *
 * IMPORTANT: This file defines the data schema for caption documents and must be kept
 * in sync with the Python schema defined in transcribe/schema.py.
 *
 * When adding or modifying fields:
 * 1. Update both TypeScript (this file) and Python (transcribe/schema.py) schemas
 * 2. Use camelCase in TypeScript and snake_case in Python with Field aliases for conversion
 * 3. Ensure optional fields are marked consistently (readonly field?: type in TS, Optional[type] in Python)
 * 4. Update serialization/parsing logic in src/utils/captionsJson.ts if needed
 * 5. Run both TypeScript and Python tests to verify compatibility
 */

/**
 * Action types for segment history entries
 */
export enum HistoryAction {
  Modified = 'modified',
  Deleted = 'deleted',
  SpeakerRenamed = 'speakerRenamed'
}

/**
 * Word-level timestamp from ASR output
 */
export interface TranscriptWord {
  readonly text: string // Word text
  readonly startTime?: number // Start time in seconds
  readonly endTime?: number // End time in seconds
}

/**
 * Transcript segment with UUID, timestamps, rating, and text
 */
export interface TranscriptSegment {
  readonly id: string // UUID - segment identifier
  readonly index: number // Zero-based ordinal index, kept in sync with sort order by start/end time

  // FIXME: In the AG Grid UI, when we sort by this column, it sorts as a string, not a number (1, 10, 100, 2, 20, 3, etc).  Same for endTime I think.  Add a test and then fix it.
  readonly startTime: number // Start time in seconds
  readonly endTime: number // End time in seconds
  readonly text: string // Segment text
  readonly words?: readonly TranscriptWord[] // Optional word-level timestamps from ASR
  readonly speakerName?: string // Optional speaker name
  readonly rating?: number // Optional rating 1-5
  readonly timestamp?: string // ISO 8601 timestamp of when the segment was created/last modified
  readonly verified?: boolean // Whether a human has reviewed/checked off this segment
  readonly asrModel?: string // Name of the ASR model that generated this segment (e.g. 'nvidia/parakeet-tdt-0.6b-v3')
  readonly notes?: string // Optional free-text notes (no time sync)
}

/**
 * @deprecated Use TranscriptSegment instead. Legacy alias for backwards compatibility.
 */
/**
 * Metadata for the transcript document
 */
export interface TranscriptMetadata {
  readonly id: string // UUID for the document
  readonly mediaFilePath?: string // Optional path to the media file (relative to captions file directory if possible)
}

/**
 * AG Grid column state for persistence
 */
export interface GridColumnState {
  readonly colId: string
  readonly width?: number
  readonly hide?: boolean
  readonly sort?: 'asc' | 'desc' | null
  readonly sortIndex?: number | null
  readonly flex?: number | null
  readonly pinned?: 'left' | 'right' | null
}

/**
 * AG Grid filter model (column ID → filter config)
 */
export interface GridFilterModel {
  readonly [colId: string]: any
}

/**
 * UI state persisted with the document (grid column layout, filters, etc.)
 */
export interface UIState {
  readonly columnState?: readonly GridColumnState[]
  readonly filterModel?: GridFilterModel
  readonly leftPanelWidth?: number // Percentage width of the left (table) panel (20–80)
  readonly captionHeight?: number // Pixel height of the current-caption display area
}

/**
 * Complete captions document with metadata
 */
export interface CaptionsDocument {
  readonly metadata: TranscriptMetadata // Document metadata (id, media file path)
  readonly title?: string // Optional document title
  readonly segments: readonly TranscriptSegment[]
  readonly filePath?: string // Original file path if loaded from file
  readonly history?: readonly SegmentHistoryEntry[] // Historical record of segment changes
  readonly embeddings?: readonly SegmentSpeakerEmbedding[] // Speaker embeddings for segments
  readonly embeddingModel?: string // Name of the embedding model that produced the speaker embeddings
  readonly uiState?: UIState // Persisted UI state (grid column layout, filters)
}

/**
 * Result of parsing a captions file
 */
export interface ParseResult {
  success: boolean
  document?: CaptionsDocument
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
  readonly action: HistoryAction // Type of action performed
  readonly actionTimestamp: string // ISO 8601 timestamp of when this action occurred
  readonly segment: TranscriptSegment // The segment's state before the change (preserves the original timestamp)
}

/**
 * Speaker embedding vector for a segment.
 * speakerEmbedding is a base64-encoded little-endian float32 byte string.
 */
export interface SegmentSpeakerEmbedding {
  readonly segmentId: string // UUID of the segment this embedding belongs to
  readonly speakerEmbedding: string // Base64-encoded little-endian float32 vector

}
