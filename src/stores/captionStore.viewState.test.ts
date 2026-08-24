/**
 * Persisting "where the user left off": playhead position and selected row, restored
 * on reopen the way Lightroom returns you to the photo you were on.
 *
 * Selection is keyed by segment UUID, not row index, so it survives sorting, filtering,
 * and edits made between save and reopen.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCaptionStore } from './captionStore'
import { parseCaptionsJSON5 } from '../utils/captionsJson5'

function docJson(): string {
  return JSON.stringify({
    metadata: { id: 'doc-1' },
    segments: [
      { id: 'seg-1', index: 0, startTime: 0, endTime: 5, text: 'First' },
      { id: 'seg-2', index: 1, startTime: 5, endTime: 10, text: 'Second' },
      { id: 'seg-3', index: 2, startTime: 10, endTime: 15, text: 'Third' }
    ]
  })
}

describe('view state round-trip', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('exports the playhead and selection into uiState', () => {
    const store = useCaptionStore()
    store.loadFromFile(docJson(), '/docs/a.captions_json5')
    store.setCurrentTime(7.25)
    store.selectSegment('seg-3')

    const uiState = parseCaptionsJSON5(store.exportToString()).document?.uiState
    expect(uiState?.playheadSeconds).toBe(7.25)
    expect(uiState?.selectedSegmentId).toBe('seg-3')
  })

  it('restores the playhead and selection on reload', () => {
    const store = useCaptionStore()
    store.loadFromFile(docJson(), '/docs/a.captions_json5')
    store.setCurrentTime(12)
    store.selectSegment('seg-3')
    const saved = store.exportToString()

    store.reset()
    expect(store.currentTime).toBe(0)

    store.loadFromFile(saved, '/docs/a.captions_json5')
    expect(store.currentTime).toBe(12)
    expect(store.selectedSegmentId).toBe('seg-3')
    // Restoring where you were is not an edit.
    expect(store.isDirty).toBe(false)
    expect(store.viewDirty).toBe(false)
  })

  it('restores layout dimensions alongside the playhead', () => {
    const store = useCaptionStore()
    store.loadFromFile(docJson(), '/docs/a.captions_json5')
    store.leftPanelWidth = 35
    store.captionHeight = 250
    const saved = store.exportToString()

    store.reset()
    store.loadFromFile(saved, '/docs/a.captions_json5')
    expect(store.leftPanelWidth).toBe(35)
    expect(store.captionHeight).toBe(250)
  })

  it('rounds the playhead so playback does not churn the file', () => {
    const store = useCaptionStore()
    store.loadFromFile(docJson(), '/docs/a.captions_json5')
    store.setCurrentTime(3.14159265358979)

    const uiState = parseCaptionsJSON5(store.exportToString()).document?.uiState
    expect(uiState?.playheadSeconds).toBe(3.142)
  })

  it('omits a playhead at the start of the file', () => {
    const store = useCaptionStore()
    store.loadFromFile(docJson(), '/docs/a.captions_json5')

    const uiState = parseCaptionsJSON5(store.exportToString()).document?.uiState
    expect(uiState?.playheadSeconds).toBeUndefined()
  })

  it('never writes a selection that no longer exists', () => {
    const store = useCaptionStore()
    store.loadFromFile(docJson(), '/docs/a.captions_json5')
    store.selectSegment('seg-3')
    store.deleteSegment('seg-3')

    const uiState = parseCaptionsJSON5(store.exportToString()).document?.uiState
    expect(uiState?.selectedSegmentId).toBeUndefined()
  })

  it('ignores a persisted selection whose segment is gone', () => {
    const store = useCaptionStore()
    const withStaleSelection = JSON.stringify({
      metadata: { id: 'doc-1' },
      segments: [{ id: 'seg-1', index: 0, startTime: 0, endTime: 5, text: 'First' }],
      uiState: { playheadSeconds: 4, selectedSegmentId: 'deleted-elsewhere' }
    })

    store.loadFromFile(withStaleSelection, '/docs/a.captions_json5')
    expect(store.selectedSegmentId).toBeNull()
    expect(store.currentTime).toBe(4)
  })

  it('survives re-sorting: selection is keyed by UUID, not row position', () => {
    const store = useCaptionStore()
    store.loadFromFile(docJson(), '/docs/a.captions_json5')
    store.selectSegment('seg-2')

    // An edit that changes where seg-2 sorts (segments are kept sorted by time).
    store.updateSegment('seg-2', { startTime: 20, endTime: 25 })
    const saved = store.exportToString()

    store.reset()
    store.loadFromFile(saved, '/docs/a.captions_json5')
    expect(store.selectedSegmentId).toBe('seg-2')
    expect(store.document.segments[store.document.segments.length - 1].id).toBe('seg-2')
  })

  it('drops the selection when ASR replaces every segment, keeping the playhead', () => {
    const store = useCaptionStore()
    store.loadFromFile(docJson(), '/docs/a.captions_json5')
    store.setCurrentTime(8)
    store.selectSegment('seg-2')

    store.mergeAsrResult(JSON.stringify({
      metadata: { id: 'asr-doc' },
      segments: [{ id: 'asr-1', index: 0, startTime: 0, endTime: 4, text: 'Fresh' }]
    }))

    expect(store.selectedSegmentId).toBeNull()
    expect(store.currentTime).toBe(8)
  })
})
