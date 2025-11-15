import { describe, it, expect } from 'vitest'
import { parseVTT, serializeVTT } from './vttParser'

describe('SegmentSpeakerEmbedding integration', () => {
  it('should parse and serialize embeddings', () => {
    const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:TranscriptMetadata {"id":"test-123"}

NOTE CAPTION_EDITOR:VTTCue {"id":"cue-1","startTime":0.0,"endTime":2.0,"text":"Hello"}

cue-1
00:00:00.000 --> 00:00:02.000
Hello

NOTE CAPTION_EDITOR:SegmentSpeakerEmbedding {"segmentId":"cue-1","speakerEmbedding":[0.1,0.2,0.3]}
`

    const result = parseVTT(vttContent)
    expect(result.success).toBe(true)
    expect(result.document).toBeDefined()

    if (result.document) {
      expect(result.document.embeddings).toBeDefined()
      expect(result.document.embeddings?.length).toBe(1)

      const embedding = result.document.embeddings?.[0]
      expect(embedding?.segmentId).toBe('cue-1')
      expect(embedding?.speakerEmbedding).toEqual([0.1, 0.2, 0.3])

      // Round-trip: serialize and parse again
      const serialized = serializeVTT(result.document)
      expect(serialized).toContain('SegmentSpeakerEmbedding')
      expect(serialized).toContain('"segmentId":"cue-1"')

      const result2 = parseVTT(serialized)
      expect(result2.success).toBe(true)
      expect(result2.document?.embeddings?.length).toBe(1)
      expect(result2.document?.embeddings?.[0].segmentId).toBe('cue-1')
    }
  })

  it('should handle documents without embeddings', () => {
    const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:TranscriptMetadata {"id":"test-123"}

NOTE CAPTION_EDITOR:VTTCue {"id":"cue-1","startTime":0.0,"endTime":2.0,"text":"Hello"}

cue-1
00:00:00.000 --> 00:00:02.000
Hello
`

    const result = parseVTT(vttContent)
    expect(result.success).toBe(true)
    expect(result.document?.embeddings).toBeUndefined()
  })

  it('should handle multiple embeddings', () => {
    const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:TranscriptMetadata {"id":"test-123"}

NOTE CAPTION_EDITOR:VTTCue {"id":"cue-1","startTime":0.0,"endTime":2.0,"text":"Hello"}

cue-1
00:00:00.000 --> 00:00:02.000
Hello

NOTE CAPTION_EDITOR:VTTCue {"id":"cue-2","startTime":2.0,"endTime":4.0,"text":"World"}

cue-2
00:00:02.000 --> 00:00:04.000
World

NOTE CAPTION_EDITOR:SegmentSpeakerEmbedding {"segmentId":"cue-1","speakerEmbedding":[0.1,0.2]}
NOTE CAPTION_EDITOR:SegmentSpeakerEmbedding {"segmentId":"cue-2","speakerEmbedding":[0.3,0.4]}
`

    const result = parseVTT(vttContent)
    expect(result.success).toBe(true)
    expect(result.document?.embeddings?.length).toBe(2)
    expect(result.document?.embeddings?.[0].segmentId).toBe('cue-1')
    expect(result.document?.embeddings?.[1].segmentId).toBe('cue-2')
  })
})
