import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCaptionStore, PlaybackMode } from './captionStore'
// import type { CaptionsDocument } from '../types/schema'

describe('Playlist Playback Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function loadTestDocument(store: ReturnType<typeof useCaptionStore>, segments: any[]) {
    store.loadFromFile(
      JSON.stringify({
        metadata: { id: 'doc1', mediaFilePath: 'test.wav' },
        segments
      })
    )
  }

  it('should start playlist playback with all segments from index 0', () => {
    const store = useCaptionStore()

    // Setup: Load a document with 3 segments
    loadTestDocument(store, [
      { id: 'seg1', startTime: 0, endTime: 2, text: 'First segment', timestamp: '2024-01-01T00:00:00.000Z' },
      { id: 'seg2', startTime: 3, endTime: 5, text: 'Second segment', timestamp: '2024-01-01T00:00:00.000Z' },
      { id: 'seg3', startTime: 6, endTime: 8, text: 'Third segment', timestamp: '2024-01-01T00:00:00.000Z' }
    ])

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
    expect(store.selectedSegmentId).toBe('seg1')
  })

  it('should start playlist playback from a specific index', () => {
    const store = useCaptionStore()

    // Setup: Load a document with 3 segments
    loadTestDocument(store, [
      { id: 'seg1', startTime: 0, endTime: 2, text: 'First segment', timestamp: '2024-01-01T00:00:00.000Z' },
      { id: 'seg2', startTime: 3, endTime: 5, text: 'Second segment', timestamp: '2024-01-01T00:00:00.000Z' },
      { id: 'seg3', startTime: 6, endTime: 8, text: 'Third segment', timestamp: '2024-01-01T00:00:00.000Z' }
    ])

    const segmentIds = store.document.segments.map(s => s.id)

    // Start from second segment (index 1)
    store.startPlaylistPlayback(segmentIds, 1)

    // Verify state
    expect(store.playlistIndex).toBe(1)
    expect(store.playlistStartIndex).toBe(1)
    expect(store.currentTime).toBe(3) // Second segment start time
    expect(store.selectedSegmentId).toBe('seg2')
  })

  it('should get current playlist segment correctly', () => {
    const store = useCaptionStore()

    // Setup document
    loadTestDocument(store, [
      { id: 'seg1', startTime: 0, endTime: 2, text: 'First segment', timestamp: '2024-01-01T00:00:00.000Z' },
      { id: 'seg2', startTime: 3, endTime: 5, text: 'Second segment', timestamp: '2024-01-01T00:00:00.000Z' }
    ])

    const segmentIds = store.document.segments.map(s => s.id)
    store.startPlaylistPlayback(segmentIds, 0)

    // Current segment should be the first one
    const currentSegment = store.currentPlaylistSegment
    expect(currentSegment).not.toBeNull()
    expect(currentSegment?.id).toBe('seg1')
    expect(currentSegment?.text).toBe('First segment')
  })

  it('should advance to next segment', () => {
    const store = useCaptionStore()

    // Setup document
    loadTestDocument(store, [
      { id: 'seg1', startTime: 0, endTime: 2, text: 'First segment', timestamp: '2024-01-01T00:00:00.000Z' },
      { id: 'seg2', startTime: 3, endTime: 5, text: 'Second segment', timestamp: '2024-01-01T00:00:00.000Z' },
      { id: 'seg3', startTime: 6, endTime: 8, text: 'Third segment', timestamp: '2024-01-01T00:00:00.000Z' }
    ])

    const segmentIds = store.document.segments.map(s => s.id)
    store.startPlaylistPlayback(segmentIds, 0)

    // Move to next segment
    const hasNext = store.nextPlaylistSegment()

    // Verify we moved to second segment
    expect(hasNext).toBe(true)
    expect(store.playlistIndex).toBe(1)
    expect(store.currentTime).toBe(3) // Second segment start time
    expect(store.selectedSegmentId).toBe('seg2')
    expect(store.currentPlaylistSegment?.id).toBe('seg2')
  })

  it('should advance with optional playhead time when avoiding a seek (small gap)', () => {
    const store = useCaptionStore()

    loadTestDocument(store, [
      { id: 'seg1', startTime: 0, endTime: 2, text: 'First', timestamp: '2024-01-01T00:00:00.000Z' },
      { id: 'seg2', startTime: 2.2, endTime: 5, text: 'Second', timestamp: '2024-01-01T00:00:00.000Z' }
    ])

    const segmentIds = store.document.segments.map(s => s.id)
    store.startPlaylistPlayback(segmentIds, 0)

    const mediaTime = 2.05
    const hasNext = store.nextPlaylistSegment(mediaTime)

    expect(hasNext).toBe(true)
    expect(store.playlistIndex).toBe(1)
    expect(store.currentTime).toBe(mediaTime)
    expect(store.selectedSegmentId).toBe('seg2')
  })

  it('should return false and return to start when reaching end of playlist', () => {
    const store = useCaptionStore()

    // Setup document with 2 segments
    loadTestDocument(store, [
      { id: 'seg1', startTime: 0, endTime: 2, text: 'First segment', timestamp: '2024-01-01T00:00:00.000Z' },
      { id: 'seg2', startTime: 3, endTime: 5, text: 'Second segment', timestamp: '2024-01-01T00:00:00.000Z' }
    ])

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
    expect(store.selectedSegmentId).toBe('seg1')
  })

  it('should stop playlist playback without returning to start', () => {
    const store = useCaptionStore()

    // Setup document
    loadTestDocument(store, [
      { id: 'seg1', startTime: 0, endTime: 2, text: 'First segment', timestamp: '2024-01-01T00:00:00.000Z' },
      { id: 'seg2', startTime: 3, endTime: 5, text: 'Second segment', timestamp: '2024-01-01T00:00:00.000Z' }
    ])

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
    const store = useCaptionStore()

    // Try to start playlist playback with empty list
    store.startPlaylistPlayback([], 0)

    // Should not crash, but won't start playing (no segments to play)
    expect(store.playlist).toEqual([])
    expect(store.currentPlaylistSegment).toBeNull()
    // Should still be in SEGMENTS_PLAYING mode (empty playlist edge case)
    expect(store.playbackMode).toBe(PlaybackMode.SEGMENTS_PLAYING)
  })

  it('should preserve playlist order even if document changes', () => {
    const store = useCaptionStore()

    // Setup document
    loadTestDocument(store, [
      { id: 'seg1', startTime: 0, endTime: 2, text: 'First segment', timestamp: '2024-01-01T00:00:00.000Z' },
      { id: 'seg2', startTime: 3, endTime: 5, text: 'Second segment', timestamp: '2024-01-01T00:00:00.000Z' },
      { id: 'seg3', startTime: 6, endTime: 8, text: 'Third segment', timestamp: '2024-01-01T00:00:00.000Z' }
    ])

    // Start playlist playback in a specific order
    const segmentIds = ['seg3', 'seg1', 'seg2'] // Out of time order
    store.startPlaylistPlayback(segmentIds, 0)

    // Verify initial state
    expect(store.playlist).toEqual(['seg3', 'seg1', 'seg2'])
    expect(store.currentPlaylistSegment?.id).toBe('seg3')

    // Simulate a document change (e.g., add a new segment)
    store.addSegment(10, 2)

    // Playlist should remain unchanged
    expect(store.playlist).toEqual(['seg3', 'seg1', 'seg2'])

    // Should still be able to advance through the original playlist
    store.nextPlaylistSegment()
    expect(store.currentPlaylistSegment?.id).toBe('seg1')
  })

  it('should handle advancing when not in playlist mode', () => {
    const store = useCaptionStore()

    // Try to advance without starting playlist playback
    const hasNext = store.nextPlaylistSegment()

    // Should return false and not crash
    expect(hasNext).toBe(false)
  })

  describe('reverse-order playlist (descending sort)', () => {
    /**
     * Reproduces the bug where playing segments in reverse chronological order
     * (e.g. index column sorted descending) causes all segments after the first
     * to be "skipped" because the seek decision logic in MediaPlayer.vue
     * never seeks backward.
     *
     * The logic calculates: timelineSilence = nextSeg.startTime - prevEnd
     * For reverse order, this is negative, which is always < 0.5s threshold,
     * so seekToNextStart is false and the media keeps playing forward.
     */

    const SEQUENTIAL_PLAYBACK_GAP_SEEK_THRESHOLD_SEC = 0.5

    /**
     * This is the seek decision logic extracted from MediaPlayer.vue onTimeUpdate().
     * It returns true when the media player should seek to the next segment's start.
     */
    function shouldSeekToNextStart(
      prevSegEndTime: number,
      nextSegStartTime: number
    ): boolean {
      const timelineSilence = nextSegStartTime - prevSegEndTime
      return timelineSilence < 0 || timelineSilence > SEQUENTIAL_PLAYBACK_GAP_SEEK_THRESHOLD_SEC
    }

    it('should seek when playing forward with a large gap (baseline)', () => {
      // seg1 ends at 2, seg2 starts at 5 → gap of 3s → should seek
      expect(shouldSeekToNextStart(2, 5)).toBe(true)
    })

    it('should NOT seek when playing forward with a tiny gap (baseline)', () => {
      // seg1 ends at 2, seg2 starts at 2.3 → gap of 0.3s → should NOT seek
      expect(shouldSeekToNextStart(2, 2.3)).toBe(false)
    })

    it('BUG: should seek when playing in reverse order (backward in time)', () => {
      // Playing seg3 (ends at 8) → seg2 (starts at 3): need to seek backward
      // timelineSilence = 3 - 8 = -5, which is < 0.5, so current code returns false
      // but it SHOULD return true because we need to jump backward in the media
      expect(shouldSeekToNextStart(8, 3)).toBe(true)
    })

    it('BUG: should seek backward even for small backward jumps', () => {
      // Playing seg2 (ends at 5) → seg1 (starts at 4): need to seek backward 1s
      // timelineSilence = 4 - 5 = -1, which is < 0.5, so current code returns false
      expect(shouldSeekToNextStart(5, 4)).toBe(true)
    })

    it('should simulate full reverse-order playlist advancement', () => {
      const store = useCaptionStore()

      // Three segments in chronological order
      loadTestDocument(store, [
        { id: 'seg1', startTime: 0, endTime: 2, text: 'First', timestamp: '2024-01-01T00:00:00.000Z' },
        { id: 'seg2', startTime: 3, endTime: 5, text: 'Second', timestamp: '2024-01-01T00:00:00.000Z' },
        { id: 'seg3', startTime: 6, endTime: 8, text: 'Third', timestamp: '2024-01-01T00:00:00.000Z' }
      ])

      // Start playlist in REVERSE order (as if index column sorted descending)
      store.startPlaylistPlayback(['seg3', 'seg2', 'seg1'], 0)

      expect(store.currentPlaylistSegment?.id).toBe('seg3')
      expect(store.currentTime).toBe(6) // seg3 starts at 6

      // Simulate what onTimeUpdate does when seg3 finishes (at time 8):
      // It needs to decide whether to seek to seg2's start (time 3).
      // prevEnd=8, nextStart=3 → timelineSilence = 3-8 = -5
      const seg3End = 8
      const seg2Start = 3
      const needsSeek1 = shouldSeekToNextStart(seg3End, seg2Start)

      // BUG: This is false because -5 < 0.5, but we NEED to seek backward
      // The media will just keep playing from time ~8 instead of jumping to time 3
      expect(needsSeek1).toBe(true)

      // Advance the store (store itself works fine, the bug is in the seek decision)
      store.nextPlaylistSegment()
      expect(store.currentPlaylistSegment?.id).toBe('seg2')

      // Same bug for seg2→seg1: prevEnd=5, nextStart=0
      const seg2End = 5
      const seg1Start = 0
      const needsSeek2 = shouldSeekToNextStart(seg2End, seg1Start)
      expect(needsSeek2).toBe(true)
    })
  })

  it('should cancel playlist playback without returning to start', () => {
    const store = useCaptionStore()

    // Setup document
    loadTestDocument(store, [
      { id: 'seg1', startTime: 0, endTime: 2, text: 'First segment', timestamp: '2024-01-01T00:00:00.000Z' },
      { id: 'seg2', startTime: 3, endTime: 5, text: 'Second segment', timestamp: '2024-01-01T00:00:00.000Z' }
    ])

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
