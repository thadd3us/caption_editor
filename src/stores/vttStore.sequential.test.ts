import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useVTTStore } from './vttStore'
// import type { VTTDocument } from '../types/schema'

describe('Sequential Playback Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should start sequential playback with all segments from index 0', () => {
    const store = useVTTStore()

    // Setup: Load a document with 3 segments
    store.loadFromFile(`WEBVTT

NOTE CAPTION_EDITOR:TranscriptMetadata {"id":"doc1","mediaFilePath":"test.wav"}

NOTE CAPTION_EDITOR:VTTCue {"id":"seg1","startTime":0,"endTime":2,"text":"First segment","timestamp":"2024-01-01T00:00:00.000Z"}

00:00:00.000 --> 00:00:02.000
First segment

NOTE CAPTION_EDITOR:VTTCue {"id":"seg2","startTime":3,"endTime":5,"text":"Second segment","timestamp":"2024-01-01T00:00:00.000Z"}

00:00:03.000 --> 00:00:05.000
Second segment

NOTE CAPTION_EDITOR:VTTCue {"id":"seg3","startTime":6,"endTime":8,"text":"Third segment","timestamp":"2024-01-01T00:00:00.000Z"}

00:00:06.000 --> 00:00:08.000
Third segment
`)

    const segmentIds = store.document.segments.map(s => s.id)

    // Start sequential playback
    store.startSequentialPlayback(segmentIds, 0)

    // Verify state
    expect(store.sequentialMode).toBe(true)
    expect(store.sequentialPlaylist).toEqual(['seg1', 'seg2', 'seg3'])
    expect(store.sequentialPlaylistIndex).toBe(0)
    expect(store.isPlaying).toBe(true)
    expect(store.snippetMode).toBe(false)
    expect(store.currentTime).toBe(0) // First segment start time
    expect(store.selectedCueId).toBe('seg1')
  })

  it('should start sequential playback from a specific index', () => {
    const store = useVTTStore()

    // Setup: Load a document with 3 segments
    store.loadFromFile(`WEBVTT

NOTE CAPTION_EDITOR:TranscriptMetadata {"id":"doc1","mediaFilePath":"test.wav"}

NOTE CAPTION_EDITOR:VTTCue {"id":"seg1","startTime":0,"endTime":2,"text":"First segment","timestamp":"2024-01-01T00:00:00.000Z"}

00:00:00.000 --> 00:00:02.000
First segment

NOTE CAPTION_EDITOR:VTTCue {"id":"seg2","startTime":3,"endTime":5,"text":"Second segment","timestamp":"2024-01-01T00:00:00.000Z"}

00:00:03.000 --> 00:00:05.000
Second segment

NOTE CAPTION_EDITOR:VTTCue {"id":"seg3","startTime":6,"endTime":8,"text":"Third segment","timestamp":"2024-01-01T00:00:00.000Z"}

00:00:06.000 --> 00:00:08.000
Third segment
`)

    const segmentIds = store.document.segments.map(s => s.id)

    // Start from second segment (index 1)
    store.startSequentialPlayback(segmentIds, 1)

    // Verify state
    expect(store.sequentialPlaylistIndex).toBe(1)
    expect(store.currentTime).toBe(3) // Second segment start time
    expect(store.selectedCueId).toBe('seg2')
  })

  it('should get current sequential segment correctly', () => {
    const store = useVTTStore()

    // Setup document
    store.loadFromFile(`WEBVTT

NOTE CAPTION_EDITOR:TranscriptMetadata {"id":"doc1","mediaFilePath":"test.wav"}

NOTE CAPTION_EDITOR:VTTCue {"id":"seg1","startTime":0,"endTime":2,"text":"First segment","timestamp":"2024-01-01T00:00:00.000Z"}

00:00:00.000 --> 00:00:02.000
First segment

NOTE CAPTION_EDITOR:VTTCue {"id":"seg2","startTime":3,"endTime":5,"text":"Second segment","timestamp":"2024-01-01T00:00:00.000Z"}

00:00:03.000 --> 00:00:05.000
Second segment
`)

    const segmentIds = store.document.segments.map(s => s.id)
    store.startSequentialPlayback(segmentIds, 0)

    // Current segment should be the first one
    const currentSegment = store.currentSequentialSegment
    expect(currentSegment).not.toBeNull()
    expect(currentSegment?.id).toBe('seg1')
    expect(currentSegment?.text).toBe('First segment')
  })

  it('should advance to next segment', () => {
    const store = useVTTStore()

    // Setup document
    store.loadFromFile(`WEBVTT

NOTE CAPTION_EDITOR:TranscriptMetadata {"id":"doc1","mediaFilePath":"test.wav"}

NOTE CAPTION_EDITOR:VTTCue {"id":"seg1","startTime":0,"endTime":2,"text":"First segment","timestamp":"2024-01-01T00:00:00.000Z"}

00:00:00.000 --> 00:00:02.000
First segment

NOTE CAPTION_EDITOR:VTTCue {"id":"seg2","startTime":3,"endTime":5,"text":"Second segment","timestamp":"2024-01-01T00:00:00.000Z"}

00:00:03.000 --> 00:00:05.000
Second segment

NOTE CAPTION_EDITOR:VTTCue {"id":"seg3","startTime":6,"endTime":8,"text":"Third segment","timestamp":"2024-01-01T00:00:00.000Z"}

00:00:06.000 --> 00:00:08.000
Third segment
`)

    const segmentIds = store.document.segments.map(s => s.id)
    store.startSequentialPlayback(segmentIds, 0)

    // Move to next segment
    const hasNext = store.nextSequentialSegment()

    // Verify we moved to second segment
    expect(hasNext).toBe(true)
    expect(store.sequentialPlaylistIndex).toBe(1)
    expect(store.currentTime).toBe(3) // Second segment start time
    expect(store.selectedCueId).toBe('seg2')
    expect(store.currentSequentialSegment?.id).toBe('seg2')
  })

  it('should return false when reaching end of playlist', () => {
    const store = useVTTStore()

    // Setup document with 2 segments
    store.loadFromFile(`WEBVTT

NOTE CAPTION_EDITOR:TranscriptMetadata {"id":"doc1","mediaFilePath":"test.wav"}

NOTE CAPTION_EDITOR:VTTCue {"id":"seg1","startTime":0,"endTime":2,"text":"First segment","timestamp":"2024-01-01T00:00:00.000Z"}

00:00:00.000 --> 00:00:02.000
First segment

NOTE CAPTION_EDITOR:VTTCue {"id":"seg2","startTime":3,"endTime":5,"text":"Second segment","timestamp":"2024-01-01T00:00:00.000Z"}

00:00:03.000 --> 00:00:05.000
Second segment
`)

    const segmentIds = store.document.segments.map(s => s.id)
    store.startSequentialPlayback(segmentIds, 0)

    // Move to second segment
    const hasNext1 = store.nextSequentialSegment()
    expect(hasNext1).toBe(true)
    expect(store.sequentialMode).toBe(true) // Still in sequential mode

    // Try to move beyond last segment
    const hasNext2 = store.nextSequentialSegment()
    expect(hasNext2).toBe(false)
    expect(store.sequentialMode).toBe(false) // Should stop sequential mode
    expect(store.isPlaying).toBe(false) // Should stop playing
  })

  it('should stop sequential playback', () => {
    const store = useVTTStore()

    // Setup document
    store.loadFromFile(`WEBVTT

NOTE CAPTION_EDITOR:TranscriptMetadata {"id":"doc1","mediaFilePath":"test.wav"}

NOTE CAPTION_EDITOR:VTTCue {"id":"seg1","startTime":0,"endTime":2,"text":"First segment","timestamp":"2024-01-01T00:00:00.000Z"}

00:00:00.000 --> 00:00:02.000
First segment

NOTE CAPTION_EDITOR:VTTCue {"id":"seg2","startTime":3,"endTime":5,"text":"Second segment","timestamp":"2024-01-01T00:00:00.000Z"}

00:00:03.000 --> 00:00:05.000
Second segment
`)

    const segmentIds = store.document.segments.map(s => s.id)
    store.startSequentialPlayback(segmentIds, 0)

    // Verify it's playing
    expect(store.sequentialMode).toBe(true)
    expect(store.isPlaying).toBe(true)

    // Stop sequential playback
    store.stopSequentialPlayback()

    // Verify state is cleared
    expect(store.sequentialMode).toBe(false)
    expect(store.sequentialPlaylist).toEqual([])
    expect(store.sequentialPlaylistIndex).toBe(0)
    expect(store.isPlaying).toBe(false)
  })

  it('should handle empty segment list gracefully', () => {
    const store = useVTTStore()

    // Try to start sequential playback with empty list
    store.startSequentialPlayback([], 0)

    // Should not crash, but won't start playing
    expect(store.sequentialMode).toBe(true)
    expect(store.sequentialPlaylist).toEqual([])
    expect(store.currentSequentialSegment).toBeNull()
  })

  it('should disable snippet mode when starting sequential playback', () => {
    const store = useVTTStore()

    // Setup document
    store.loadFromFile(`WEBVTT

NOTE CAPTION_EDITOR:TranscriptMetadata {"id":"doc1","mediaFilePath":"test.wav"}

NOTE CAPTION_EDITOR:VTTCue {"id":"seg1","startTime":0,"endTime":2,"text":"First segment","timestamp":"2024-01-01T00:00:00.000Z"}

00:00:00.000 --> 00:00:02.000
First segment
`)

    // Enable snippet mode first
    store.setSnippetMode(true)
    expect(store.snippetMode).toBe(true)

    // Start sequential playback
    const segmentIds = store.document.segments.map(s => s.id)
    store.startSequentialPlayback(segmentIds, 0)

    // Snippet mode should be disabled
    expect(store.snippetMode).toBe(false)
    expect(store.sequentialMode).toBe(true)
  })

  it('should preserve playlist order even if document changes', () => {
    const store = useVTTStore()

    // Setup document
    store.loadFromFile(`WEBVTT

NOTE CAPTION_EDITOR:TranscriptMetadata {"id":"doc1","mediaFilePath":"test.wav"}

NOTE CAPTION_EDITOR:VTTCue {"id":"seg1","startTime":0,"endTime":2,"text":"First segment","timestamp":"2024-01-01T00:00:00.000Z"}

00:00:00.000 --> 00:00:02.000
First segment

NOTE CAPTION_EDITOR:VTTCue {"id":"seg2","startTime":3,"endTime":5,"text":"Second segment","timestamp":"2024-01-01T00:00:00.000Z"}

00:00:03.000 --> 00:00:05.000
Second segment

NOTE CAPTION_EDITOR:VTTCue {"id":"seg3","startTime":6,"endTime":8,"text":"Third segment","timestamp":"2024-01-01T00:00:00.000Z"}

00:00:06.000 --> 00:00:08.000
Third segment
`)

    // Start sequential playback in a specific order
    const segmentIds = ['seg3', 'seg1', 'seg2'] // Out of time order
    store.startSequentialPlayback(segmentIds, 0)

    // Verify initial state
    expect(store.sequentialPlaylist).toEqual(['seg3', 'seg1', 'seg2'])
    expect(store.currentSequentialSegment?.id).toBe('seg3')

    // Simulate a document change (e.g., add a new segment)
    store.addCue(10, 2)

    // Playlist should remain unchanged
    expect(store.sequentialPlaylist).toEqual(['seg3', 'seg1', 'seg2'])

    // Should still be able to advance through the original playlist
    store.nextSequentialSegment()
    expect(store.currentSequentialSegment?.id).toBe('seg1')
  })

  it('should handle advancing when not in sequential mode', () => {
    const store = useVTTStore()

    // Try to advance without starting sequential playback
    const hasNext = store.nextSequentialSegment()

    // Should return false and not crash
    expect(hasNext).toBe(false)
  })
})
