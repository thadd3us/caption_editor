import { describe, it, expect } from 'vitest'
import { parseCaptionsJSON, serializeCaptionsJSON } from './captionsJson'
import type { CaptionsDocument, UIState } from '../types/schema'

describe('captionsJson uiState round-trip', () => {
  const baseDocument: CaptionsDocument = {
    metadata: { id: 'test-doc-1' },
    segments: [
      { id: 'seg-1', startTime: 0, endTime: 5, text: 'Hello' },
      { id: 'seg-2', startTime: 5, endTime: 10, text: 'World' }
    ]
  }

  it('should serialize and parse uiState with column visibility', () => {
    const uiState: UIState = {
      columnState: [
        { colId: 'text', hide: false, width: 300 },
        { colId: 'rating', hide: true },
        { colId: 'startTime', hide: false, width: 120, sort: 'asc', sortIndex: 0 },
        { colId: 'endTime', hide: true },
        { colId: 'speakerName', hide: false, width: 150 }
      ]
    }

    const docWithState: CaptionsDocument = { ...baseDocument, uiState }
    const serialized = serializeCaptionsJSON(docWithState)
    const parsed = parseCaptionsJSON(serialized)

    expect(parsed.success).toBe(true)
    expect(parsed.document?.uiState).toBeDefined()
    expect(parsed.document?.uiState?.columnState).toHaveLength(5)

    // Verify hidden columns are preserved
    const ratingCol = parsed.document?.uiState?.columnState?.find(c => c.colId === 'rating')
    expect(ratingCol?.hide).toBe(true)

    const endCol = parsed.document?.uiState?.columnState?.find(c => c.colId === 'endTime')
    expect(endCol?.hide).toBe(true)

    // Verify visible columns are preserved
    const textCol = parsed.document?.uiState?.columnState?.find(c => c.colId === 'text')
    expect(textCol?.hide).toBe(false)
    expect(textCol?.width).toBe(300)

    // Verify sort state is preserved
    const startCol = parsed.document?.uiState?.columnState?.find(c => c.colId === 'startTime')
    expect(startCol?.sort).toBe('asc')
    expect(startCol?.sortIndex).toBe(0)
  })

  it('should serialize and parse uiState with filterModel', () => {
    const uiState: UIState = {
      columnState: [
        { colId: 'text', hide: false }
      ],
      filterModel: {
        text: { type: 'contains', filter: 'hello', filterType: 'text' }
      }
    }

    const docWithState: CaptionsDocument = { ...baseDocument, uiState }
    const serialized = serializeCaptionsJSON(docWithState)
    const parsed = parseCaptionsJSON(serialized)

    expect(parsed.success).toBe(true)
    expect(parsed.document?.uiState?.filterModel).toBeDefined()
    expect(parsed.document?.uiState?.filterModel?.text?.filter).toBe('hello')
  })

  it('should handle document without uiState', () => {
    const serialized = serializeCaptionsJSON(baseDocument)
    const parsed = parseCaptionsJSON(serialized)

    expect(parsed.success).toBe(true)
    expect(parsed.document?.uiState).toBeUndefined()
  })

  it('should preserve uiState through multiple round-trips', () => {
    const uiState: UIState = {
      columnState: [
        { colId: 'text', hide: false, width: 300 },
        { colId: 'rating', hide: true },
        { colId: 'speakerSimilarity', hide: true }
      ]
    }

    const docWithState: CaptionsDocument = { ...baseDocument, uiState }

    // Round-trip 1
    const serialized1 = serializeCaptionsJSON(docWithState)
    const parsed1 = parseCaptionsJSON(serialized1)
    expect(parsed1.success).toBe(true)

    // Round-trip 2
    const serialized2 = serializeCaptionsJSON(parsed1.document!)
    const parsed2 = parseCaptionsJSON(serialized2)
    expect(parsed2.success).toBe(true)

    // Should be identical
    expect(serialized1).toBe(serialized2)

    const ratingCol = parsed2.document?.uiState?.columnState?.find(c => c.colId === 'rating')
    expect(ratingCol?.hide).toBe(true)
  })
})
