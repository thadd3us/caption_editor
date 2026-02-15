import { describe, it, expect } from 'vitest'
import { createDocumentFromSrtContent, exportDocumentToSrt } from './srt'

describe('srt import/export (golden)', () => {
  it('imports SRT into sorted segments', () => {
    const srt = [
      '1',
      '00:00:05,000 --> 00:00:06,000',
      'Second',
      '',
      '2',
      '00:00:01,000 --> 00:00:04,000',
      'First',
      ''
    ].join('\n')

    const result = createDocumentFromSrtContent(srt)
    expect(result.success).toBe(true)
    if (!result.success) return

    // IDs are UUIDs (non-deterministic), so snapshot only the stable fields.
    const simplified = result.document.segments.map(s => ({
      startTime: s.startTime,
      endTime: s.endTime,
      text: s.text
    }))

    expect(simplified).toMatchInlineSnapshot(`
      [
        {
          "endTime": 4,
          "startTime": 1,
          "text": "First",
        },
        {
          "endTime": 6,
          "startTime": 5,
          "text": "Second",
        },
      ]
    `)
  })

  it('exports a document to SRT (golden)', () => {
    const doc: any = {
      metadata: { id: 'doc1' },
      segments: [
        { id: 'a', startTime: 1, endTime: 4, text: 'Hello' },
        { id: 'b', startTime: 5.5, endTime: 6.25, text: 'World' }
      ]
    }

    expect(exportDocumentToSrt(doc)).toMatchInlineSnapshot(`
      "1
      00:00:01,000 --> 00:00:04,000
      Hello

      2
      00:00:05,500 --> 00:00:06,250
      World

      "
    `)
  })
})

