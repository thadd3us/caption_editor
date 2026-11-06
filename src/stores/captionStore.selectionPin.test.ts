/**
 * A row the user clicked stays selected until the playhead really leaves it.
 *
 * After ASR, neighbouring segments touch (one ends exactly where the next begins) or
 * overlap by a few milliseconds. Seeking to a row's start then lands the media element a
 * frame *before* that start — inside the previous segment — and the playhead-driven
 * auto-selection used to drag the selection (and, under a speaker-similarity sort, the
 * viewport) off to that other row.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCaptionStore } from './captionStore'

function docJson(): string {
  return JSON.stringify({
    metadata: { id: 'doc-1' },
    segments: [
      { id: 'seg-1', index: 0, startTime: 0, endTime: 5, text: 'First' },
      // Overlaps seg-3's start by 10ms, as chunked ASR output often does
      { id: 'seg-2', index: 1, startTime: 5, endTime: 10.01, text: 'Second' },
      { id: 'seg-3', index: 2, startTime: 10, endTime: 15, text: 'Third' }
    ]
  })
}

describe('selection pinning', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('keeps the clicked row selected when the seek lands just short of its start', () => {
    const store = useCaptionStore()
    store.loadFromFile(docJson(), '/docs/a.captions_json5')

    // Click row seg-2: select it, then move the playhead to its start.
    store.selectSegment('seg-2')
    store.setCurrentTime(5)
    expect(store.selectedSegmentId).toBe('seg-2')

    // The element reports a position a few ms early — inside seg-1.
    store.setCurrentTime(4.995)
    expect(store.selectedSegmentId).toBe('seg-2')
    expect(store.currentSegment?.id).toBe('seg-2')
  })

  it('keeps the clicked row selected when an earlier segment overlaps its start', () => {
    const store = useCaptionStore()
    store.loadFromFile(docJson(), '/docs/a.captions_json5')

    store.selectSegment('seg-3')
    store.setCurrentTime(10)
    expect(store.selectedSegmentId).toBe('seg-3')
    expect(store.currentSegment?.id).toBe('seg-3')
  })

  it('releases the pin once playback advances past the pinned row', () => {
    const store = useCaptionStore()
    store.loadFromFile(docJson(), '/docs/a.captions_json5')

    store.selectSegment('seg-1')
    store.setCurrentTime(0)
    store.setCurrentTime(3)
    expect(store.selectedSegmentId).toBe('seg-1')

    store.setCurrentTime(6)
    expect(store.selectedSegmentId).toBe('seg-2')
    expect(store.currentSegment?.id).toBe('seg-2')
  })

  it('releases the pin when the playhead is dragged backwards out of the row', () => {
    const store = useCaptionStore()
    store.loadFromFile(docJson(), '/docs/a.captions_json5')

    store.selectSegment('seg-3')
    store.setCurrentTime(10)
    store.setCurrentTime(2)
    expect(store.selectedSegmentId).toBe('seg-1')
  })

  it('holds a row selected from the context menu while the playhead sits elsewhere', () => {
    const store = useCaptionStore()
    store.loadFromFile(docJson(), '/docs/a.captions_json5')

    // Playhead parked in seg-3; the user selects seg-1 without seeking.
    store.setCurrentTime(12)
    store.selectSegment('seg-1')

    // `timeupdate` keeps firing with essentially the same position.
    store.setCurrentTime(12.02)
    expect(store.selectedSegmentId).toBe('seg-1')
    expect(store.currentSegment?.id).toBe('seg-1')
  })

  it('hands the selection back to the playhead once playback moves it', () => {
    const store = useCaptionStore()
    store.loadFromFile(docJson(), '/docs/a.captions_json5')

    store.setCurrentTime(12)
    store.selectSegment('seg-1')
    store.setCurrentTime(12.6)
    expect(store.selectedSegmentId).toBe('seg-3')
  })

  it('keeps the row selected when its End cell seeks to the next segment', () => {
    const store = useCaptionStore()
    store.loadFromFile(docJson(), '/docs/a.captions_json5')

    // What CaptionTable's End-time cell does: seek, then pin the clicked row.
    store.setCurrentTime(5)
    store.selectSegment('seg-1')
    expect(store.selectedSegmentId).toBe('seg-1')
    store.setCurrentTime(5.01)
    expect(store.selectedSegmentId).toBe('seg-1')
  })

  it('moves the pin when another row is selected', () => {
    const store = useCaptionStore()
    store.loadFromFile(docJson(), '/docs/a.captions_json5')

    store.selectSegment('seg-3')
    store.setCurrentTime(10)
    store.selectSegment('seg-1')
    expect(store.pinnedSegment?.id).toBe('seg-1')
  })
})
