import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useVTTStore, PlaybackMode } from './vttStore'
// import type { VTTDocument } from '../types/schema'

describe('Playlist Playback Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should start playlist playback with all segments from index 0', () => {
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

    // Start playlist playback
    store.startPlaylistPlayback(segmentIds, 0)

    // Verify state
    expect(store.playbackMode).toBe(PlaybackMode.SEGMENTS_PLAYING)
    expect(store.playlist).toEqual(['seg1', 'seg2', 'seg3'])
    expect(store.playlistIndex).toBe(0)
    expect(store.playlistStartIndex).toBe(0)
    expect(store.isPlaying).toBe(true)
    expect(store.currentTime).toBe(0) // First segment start time
    expect(store.selectedCueId).toBe('seg1')
  })

  it('should start playlist playback from a specific index', () => {
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
    store.startPlaylistPlayback(segmentIds, 1)

    // Verify state
    expect(store.playlistIndex).toBe(1)
    expect(store.playlistStartIndex).toBe(1)
    expect(store.currentTime).toBe(3) // Second segment start time
    expect(store.selectedCueId).toBe('seg2')
  })

  it('should get current playlist segment correctly', () => {
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
    store.startPlaylistPlayback(segmentIds, 0)

    // Current segment should be the first one
    const currentSegment = store.currentPlaylistSegment
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
    store.startPlaylistPlayback(segmentIds, 0)

    // Move to next segment
    const hasNext = store.nextPlaylistSegment()

    // Verify we moved to second segment
    expect(hasNext).toBe(true)
    expect(store.playlistIndex).toBe(1)
    expect(store.currentTime).toBe(3) // Second segment start time
    expect(store.selectedCueId).toBe('seg2')
    expect(store.currentPlaylistSegment?.id).toBe('seg2')
  })

  it('should return false and return to start when reaching end of playlist', () => {
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
    store.startPlaylistPlayback(segmentIds, 0)

    // Move to second segment
    const hasNext1 = store.nextPlaylistSegment()
    expect(hasNext1).toBe(true)
    expect(store.playbackMode).toBe(PlaybackMode.SEGMENTS_PLAYING) // Still in playlist mode

    // Try to move beyond last segment
    const hasNext2 = store.nextPlaylistSegment()
    expect(hasNext2).toBe(false)
    expect(store.playbackMode).toBe(PlaybackMode.STOPPED) // Should return to STOPPED mode
    expect(store.isPlaying).toBe(false) // Should stop playing
    // Should have returned to start (seg1)
    expect(store.currentTime).toBe(0)
    expect(store.selectedCueId).toBe('seg1')
  })

  it('should stop playlist playback without returning to start', () => {
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
    store.startPlaylistPlayback(segmentIds, 0)

    // Verify it's playing
    expect(store.playbackMode).toBe(PlaybackMode.SEGMENTS_PLAYING)
    expect(store.isPlaying).toBe(true)

    // Stop playlist playback (manual stop, don't return to start)
    store.stopPlaylistPlayback(false)

    // Verify state is cleared
    expect(store.playbackMode).toBe(PlaybackMode.STOPPED)
    expect(store.playlist).toEqual([])
    expect(store.playlistIndex).toBe(0)
    expect(store.isPlaying).toBe(false)
    // Should still be at seg1 (didn't move playhead)
    expect(store.currentTime).toBe(0)
  })

  it('should handle empty segment list gracefully', () => {
    const store = useVTTStore()

    // Try to start playlist playback with empty list
    store.startPlaylistPlayback([], 0)

    // Should not crash, but won't start playing (no segments to play)
    expect(store.playlist).toEqual([])
    expect(store.currentPlaylistSegment).toBeNull()
    // Should still be in SEGMENTS_PLAYING mode (empty playlist edge case)
    expect(store.playbackMode).toBe(PlaybackMode.SEGMENTS_PLAYING)
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

    // Start playlist playback in a specific order
    const segmentIds = ['seg3', 'seg1', 'seg2'] // Out of time order
    store.startPlaylistPlayback(segmentIds, 0)

    // Verify initial state
    expect(store.playlist).toEqual(['seg3', 'seg1', 'seg2'])
    expect(store.currentPlaylistSegment?.id).toBe('seg3')

    // Simulate a document change (e.g., add a new segment)
    store.addCue(10, 2)

    // Playlist should remain unchanged
    expect(store.playlist).toEqual(['seg3', 'seg1', 'seg2'])

    // Should still be able to advance through the original playlist
    store.nextPlaylistSegment()
    expect(store.currentPlaylistSegment?.id).toBe('seg1')
  })

  it('should handle advancing when not in playlist mode', () => {
    const store = useVTTStore()

    // Try to advance without starting playlist playback
    const hasNext = store.nextPlaylistSegment()

    // Should return false and not crash
    expect(hasNext).toBe(false)
  })

  it('should cancel playlist playback without returning to start', () => {
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
    store.startPlaylistPlayback(segmentIds, 0)

    // Move to second segment
    store.nextPlaylistSegment()
    expect(store.currentTime).toBe(3) // At seg2

    // Cancel playlist playback (e.g., user scrubbed)
    store.cancelPlaylistPlayback()

    // Verify playlist is cleared but playhead didn't move
    expect(store.playbackMode).toBe(PlaybackMode.STOPPED)
    expect(store.playlist).toEqual([])
    expect(store.currentTime).toBe(3) // Still at seg2
  })
})
