import { v4 as uuidv4 } from 'uuid'
import type { ParseResult, TranscriptSegment, TranscriptMetadata, VTTDocument } from '../types/schema'
import { stableJsonStringify } from './stableJson'

function sortSegments(segments: readonly TranscriptSegment[]): readonly TranscriptSegment[] {
  const sorted = [...segments].sort((a, b) => {
    if (a.startTime !== b.startTime) return a.startTime - b.startTime
    return a.endTime - b.endTime
  })
  return Object.freeze(sorted)
}

function validateUniqueSegmentIds(segments: readonly TranscriptSegment[]): { ok: true } | { ok: false; error: string } {
  const ids = new Set<string>()
  const duplicates: string[] = []
  for (const seg of segments) {
    if (ids.has(seg.id)) duplicates.push(seg.id)
    else ids.add(seg.id)
  }
  if (duplicates.length > 0) {
    return {
      ok: false,
      error: `Invalid captions JSON: ${duplicates.length} duplicate segment ID(s) found. Duplicates: ${duplicates.slice(0, 5).join(', ')}${duplicates.length > 5 ? '...' : ''}`
    }
  }
  return { ok: true }
}

function isTranscriptMetadata(value: unknown): value is TranscriptMetadata {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.id === 'string' && v.id.length > 0
}

function isTranscriptSegment(value: unknown): value is TranscriptSegment {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.startTime === 'number' &&
    typeof v.endTime === 'number' &&
    typeof v.text === 'string'
  )
}

export function parseCaptionsJSON(content: string): ParseResult {
  try {
    const parsed = JSON.parse(content) as unknown
    if (!parsed || typeof parsed !== 'object') {
      return { success: false, error: 'Invalid captions JSON: expected an object' }
    }

    const obj = parsed as Record<string, unknown>
    const metadata = obj.metadata
    const segments = obj.segments

    if (!isTranscriptMetadata(metadata)) {
      return { success: false, error: 'Invalid captions JSON: missing/invalid metadata.id' }
    }
    if (!Array.isArray(segments)) {
      return { success: false, error: 'Invalid captions JSON: missing/invalid segments[]' }
    }

    const typedSegments: TranscriptSegment[] = []
    for (const s of segments) {
      if (!isTranscriptSegment(s)) {
        return { success: false, error: 'Invalid captions JSON: one or more segments is invalid' }
      }
      typedSegments.push(s)
    }

    const unique = validateUniqueSegmentIds(typedSegments)
    if (!unique.ok) return { success: false, error: unique.error }

    const document: VTTDocument = {
      metadata,
      segments: sortSegments(typedSegments),
      history: Array.isArray(obj.history) ? (obj.history as any) : undefined,
      embeddings: Array.isArray(obj.embeddings) ? (obj.embeddings as any) : undefined
      // filePath is intentionally not persisted; it’s attached by caller
    }

    return { success: true, document }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown JSON parsing error'
    }
  }
}

/**
 * Serialize a document to the on-disk `.captions.json` format.
 *
 * Notes:
 * - `filePath` is runtime-only and is never persisted.
 * - Keys are deep-sorted for stable diffs.
 */
export function serializeCaptionsJSON(document: VTTDocument): string {
  const { filePath: _filePath, ...persisted } = document as any
  return stableJsonStringify(persisted)
}

/**
 * Create a minimal document from segments (used for imports like SRT).
 */
export function createDocumentFromSegments(segments: readonly Omit<TranscriptSegment, 'id'>[], metadata?: Partial<TranscriptMetadata>): VTTDocument {
  const withIds: TranscriptSegment[] = segments.map(s => ({ ...s, id: uuidv4() }))
  const doc: VTTDocument = {
    metadata: {
      id: metadata?.id || uuidv4(),
      mediaFilePath: metadata?.mediaFilePath
    },
    segments: sortSegments(withIds)
  }
  return doc
}

