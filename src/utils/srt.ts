import type { TranscriptSegment, CaptionsDocument } from '../types/schema'
import { createDocumentFromSegments } from './captionsJson'
import SrtParser from '@qgustavor/srt-parser'

type SrtEntryFromParser = {
  id: string
  startTime: number // seconds
  endTime: number // seconds
  text: string
}

export function createDocumentFromSrtContent(content: string): { success: true; document: CaptionsDocument } | { success: false; error: string } {
  try {
    const parser = new SrtParser({ numericTimestamps: true })
    const entries = parser.fromSrt(content) as SrtEntryFromParser[]
    const segments: Array<Omit<TranscriptSegment, 'id'>> = []
    for (const entry of entries) {
      // `fromSrt()` returns numeric timestamps in seconds when numericTimestamps=true.
      const startTime = entry.startTime
      const endTime = entry.endTime
      if (!(Number.isFinite(startTime) && Number.isFinite(endTime))) continue
      if (endTime <= startTime) continue
      segments.push({
        startTime,
        endTime,
        text: entry.text ?? ''
      })
    }

    return { success: true, document: createDocumentFromSegments(segments) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to parse SRT' }
  }
}

export function exportDocumentToSrt(document: CaptionsDocument): string {
  const parser = new SrtParser({ numericTimestamps: true })
  // `toSrt()` expects numeric timestamps in milliseconds when numericTimestamps=true.
  const entries: Array<{ id: string; startTime: number; endTime: number; text: string }> = document.segments.map((seg, idx) => ({
    id: String(idx + 1),
    startTime: Math.round(seg.startTime * 1000),
    endTime: Math.round(seg.endTime * 1000),
    text: seg.text ?? ''
  }))
  const out = parser.toSrt(entries as any)
  return out.endsWith('\n') ? out : out + '\n'
}

