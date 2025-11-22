import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import type { VTTDocument, TranscriptSegment } from '../types/schema'
import {
  parseVTT,
  serializeVTT,
  createEmptyDocument,
  addCue as addCueToDoc,
  updateCue as updateCueInDoc,
  deleteCue as deleteCueFromDoc,
  renameSpeaker as renameSpeakerInDoc,
  splitSegment as splitSegmentInDoc,
  mergeAdjacentSegments as mergeAdjacentSegmentsInDoc,
  getCurrentTimestamp
} from '../utils/vttParser'

/**
 * Playback modes for the media player
 */
export enum PlaybackMode {
  /** Normal continuous playback - media plays forward normally */
  MEDIA_PLAYING = 'MEDIA_PLAYING',
  /** Playlist-based segment playback - plays specific segments in order */
  SEGMENTS_PLAYING = 'SEGMENTS_PLAYING'
}

export const useVTTStore = defineStore('vtt', () => {
  // State - all state lives in memory only, persisted by saving VTT files
  const document = ref<VTTDocument>(createEmptyDocument())

  // Media URL - always a file:// URL in Electron mode
  // Example: file:///Users/name/path/to/audio.wav
  const mediaPath = ref<string | null>(null)

  const currentTime = ref(0)
  const isPlaying = ref(false)
  const selectedCueId = ref<string | null>(null)

  // Playback mode state
  const playbackMode = ref<PlaybackMode>(PlaybackMode.MEDIA_PLAYING)

  // Playlist-based playback state (only used in SEGMENTS_PLAYING mode)
  const playlist = ref<string[]>([])  // Ordered list of segment IDs to play
  const playlistIndex = ref(0)  // Current position in the playlist
  const playlistStartIndex = ref(0)  // Starting position (for returning after completion)

  // Computed
  const currentCue = computed(() => {
    const time = currentTime.value
    // document.segments is always kept sorted
    return document.value.segments.find(
      segment => segment.startTime <= time && time < segment.endTime
    )
  })

  // Computed property for mediaFilePath - single source of truth from document.metadata
  const mediaFilePath = computed(() => document.value.metadata.mediaFilePath || null)

  // Computed property for current playlist segment (only valid in SEGMENTS_PLAYING mode)
  const currentPlaylistSegment = computed(() => {
    if (playbackMode.value !== PlaybackMode.SEGMENTS_PLAYING || playlistIndex.value >= playlist.value.length) {
      return null
    }
    const segmentId = playlist.value[playlistIndex.value]
    return document.value.segments.find(s => s.id === segmentId) || null
  })

  // Actions
  function loadFromFile(content: string, filePath?: string) {
    console.log('Loading VTT from file:', filePath)
    const result = parseVTT(content)

    if (result.success && result.document) {
      const loadedDoc = {
        ...result.document,
        filePath
      }

      // Convert relative media file path to absolute path
      // According to architecture: paths are stored as absolute internally, relative only on export
      try {
        const electronAPI = (window as any).electronAPI
        if (loadedDoc.metadata.mediaFilePath && filePath && electronAPI?.path) {
          const mediaPath = loadedDoc.metadata.mediaFilePath
          // Only convert if it's a relative path
          if (!electronAPI.path.isAbsolute(mediaPath)) {
            const vttDir = electronAPI.path.dirname(filePath)
            const absoluteMediaPath = electronAPI.path.resolve(vttDir, mediaPath)
            console.log('Converting relative media path to absolute:')
            console.log('  Relative:', mediaPath)
            console.log('  VTT dir:', vttDir)
            console.log('  Absolute:', absoluteMediaPath)
            loadedDoc.metadata = {
              ...loadedDoc.metadata,
              mediaFilePath: absoluteMediaPath
            }
          }
        }
      } catch (error) {
        console.error('Error converting media path to absolute:', error)
        // Continue loading even if path conversion fails
      }

      document.value = loadedDoc
      console.log('Loaded document with', document.value.segments.length, 'segments')
    } else {
      console.error('Failed to load VTT:', result.error)
      throw new Error(result.error || 'Failed to parse VTT file')
    }
  }

  /**
   * Load a media file for playback (Electron mode)
   * @param path - file:// URL to use as media element src
   * @param filePath - Absolute file path to store in document metadata (will be converted to relative on export)
   */
  function loadMediaFile(path: string, filePath?: string) {
    console.log('Loading media file:', path, 'with file path:', filePath)
    mediaPath.value = path

    // Store the ABSOLUTE file path in metadata
    // We'll convert it to a relative path only when exporting/saving the VTT file
    if (filePath) {
      document.value = {
        ...document.value,
        metadata: {
          ...document.value.metadata,
          mediaFilePath: filePath  // Store absolute path
        }
      }
    }
  }

  function exportToString(): string {
    console.log('Exporting VTT document')
    console.log('  document.value.filePath:', document.value.filePath || '(null)')
    console.log('  document.value.metadata.mediaFilePath:', document.value.metadata.mediaFilePath || '(null)')

    // Convert absolute media path to relative path for VTT file export
    // This is important for portability and for Save As operations where the VTT file moves
    let documentToExport = document.value

    const absoluteMediaPath = document.value.metadata.mediaFilePath
    const electronAPI = (window as any).electronAPI

    if (absoluteMediaPath && document.value.filePath && electronAPI?.path) {
      try {
        // Check if the media path is already absolute (using Node.js path module)
        if (electronAPI.path.isAbsolute(absoluteMediaPath)) {
          // Compute the relative path from the VTT file directory to the media file
          const vttDir = electronAPI.path.dirname(document.value.filePath)
          console.log('  VTT directory:', vttDir)
          console.log('  Computing relative path from', vttDir, 'to', absoluteMediaPath)

          // Use Node.js path.relative() to compute the relative path
          const relativeMediaPath = electronAPI.path.relative(vttDir, absoluteMediaPath)

          console.log('Converting media path for export:')
          console.log('  VTT file path:', document.value.filePath)
          console.log('  Absolute media path:', absoluteMediaPath)
          console.log('  Relative path:', relativeMediaPath)

          // Update the document metadata with the relative path for export
          documentToExport = {
            ...document.value,
            metadata: {
              ...document.value.metadata,
              mediaFilePath: relativeMediaPath
            }
          }
        } else {
          // It's already a relative path, no conversion needed
          console.log('  Media path is already relative:', absoluteMediaPath)
        }
      } catch (error) {
        console.error('Error converting media path to relative:', error)
        // Fall back to original document
      }
    }

    return serializeVTT(documentToExport)
  }

  function updateFilePath(filePath: string) {
    console.log('Updating file path:', filePath)
    document.value = {
      ...document.value,
      filePath
    }
  }

  function addCue(startTime: number, duration: number = 5) {
    console.log('Adding new cue at', startTime, 'with duration', duration)
    const newCue: TranscriptSegment = {
      id: uuidv4(),
      startTime,
      endTime: startTime + duration,
      text: 'New caption',
      rating: undefined,
      timestamp: getCurrentTimestamp()
    }

    document.value = addCueToDoc(document.value, newCue)
    return newCue.id
  }

  function updateCue(cueId: string, updates: Partial<Omit<TranscriptSegment, 'id'>>) {
    console.log('Updating segment:', cueId, updates)

    // Validate timestamps if provided
    if (updates.startTime !== undefined && updates.endTime !== undefined) {
      if (updates.endTime <= updates.startTime) {
        throw new Error('End time must be greater than start time')
      }
    } else if (updates.startTime !== undefined) {
      const segment = document.value.segments.find(c => c.id === cueId)
      if (segment && updates.startTime >= segment.endTime) {
        throw new Error('Start time must be less than end time')
      }
    } else if (updates.endTime !== undefined) {
      const segment = document.value.segments.find(c => c.id === cueId)
      if (segment && updates.endTime <= segment.startTime) {
        throw new Error('End time must be greater than start time')
      }
    }

    document.value = updateCueInDoc(document.value, cueId, updates)
  }

  function deleteCue(cueId: string) {
    console.log('Deleting segment:', cueId)
    document.value = deleteCueFromDoc(document.value, cueId)
    if (selectedCueId.value === cueId) {
      selectedCueId.value = null
    }
  }

  function renameSpeaker(oldName: string, newName: string) {
    console.log('Renaming speaker in store:', oldName, '->', newName)
    document.value = renameSpeakerInDoc(document.value, oldName, newName)
  }

  function bulkSetSpeaker(cueIds: string[], speakerName: string) {
    console.log('Bulk setting speaker for', cueIds.length, 'cues to:', speakerName)

    // Update each cue with the new speaker name
    let updatedDoc = document.value
    for (const cueId of cueIds) {
      updatedDoc = updateCueInDoc(updatedDoc, cueId, { speakerName })
    }

    document.value = updatedDoc
  }

  function bulkDeleteCues(cueIds: string[]) {
    console.log('Bulk deleting', cueIds.length, 'cues')

    // Delete each cue
    let updatedDoc = document.value
    for (const cueId of cueIds) {
      updatedDoc = deleteCueFromDoc(updatedDoc, cueId)
    }

    document.value = updatedDoc

    // Clear selectedCueId if it was deleted
    if (selectedCueId.value && cueIds.includes(selectedCueId.value)) {
      selectedCueId.value = null
    }
  }

  function splitSegmentAtWordIndex(segmentId: string, wordIndex: number) {
    console.log('Splitting segment in store:', segmentId, 'at word index:', wordIndex)
    document.value = splitSegmentInDoc(document.value, segmentId, wordIndex)
  }

  function mergeAdjacentSegments(segmentIds: string[]) {
    console.log('Merging adjacent segments in store:', segmentIds)
    document.value = mergeAdjacentSegmentsInDoc(document.value, segmentIds)
  }

  function setCurrentTime(time: number) {
    currentTime.value = time

    // Auto-select current cue
    const cue = currentCue.value
    if (cue) {
      selectedCueId.value = cue.id
    }
  }

  function setPlaying(playing: boolean) {
    isPlaying.value = playing
  }

  function selectCue(cueId: string | null) {
    selectedCueId.value = cueId
  }

  /**
   * Start playlist-based playback (SEGMENTS_PLAYING mode)
   * @param segmentIds - Ordered array of segment IDs to play
   * @param startIndex - Index to start playback from (default 0)
   */
  function startPlaylistPlayback(segmentIds: string[], startIndex: number = 0) {
    console.log('Starting playlist playback with', segmentIds.length, 'segments, starting at index', startIndex)
    playbackMode.value = PlaybackMode.SEGMENTS_PLAYING
    playlist.value = segmentIds
    playlistIndex.value = startIndex
    playlistStartIndex.value = startIndex

    // Start playing the first segment
    const segment = currentPlaylistSegment.value
    if (segment) {
      console.log('Playing first segment in playlist:', segment.id)
      setCurrentTime(segment.startTime)
      setPlaying(true)
      selectCue(segment.id)
    }
  }

  /**
   * Stop playlist playback and return to MEDIA_PLAYING mode
   * @param returnToStart - If true, return playhead to the start of the first segment in the playlist
   */
  function stopPlaylistPlayback(returnToStart: boolean = false) {
    console.log('Stopping playlist playback, returnToStart:', returnToStart)

    // Return to start of playlist if requested
    if (returnToStart && playlist.value.length > 0) {
      const firstSegmentId = playlist.value[playlistStartIndex.value]
      const firstSegment = document.value.segments.find(s => s.id === firstSegmentId)
      if (firstSegment) {
        console.log('Returning to start of playlist:', firstSegmentId)
        setCurrentTime(firstSegment.startTime)
        selectCue(firstSegmentId)
      }
    }

    playbackMode.value = PlaybackMode.MEDIA_PLAYING
    playlist.value = []
    playlistIndex.value = 0
    playlistStartIndex.value = 0
    setPlaying(false)
  }

  /**
   * Move to the next segment in the playlist
   * @returns true if there's a next segment, false if we've reached the end
   */
  function nextPlaylistSegment(): boolean {
    if (playbackMode.value !== PlaybackMode.SEGMENTS_PLAYING) {
      return false
    }

    const nextIndex = playlistIndex.value + 1
    if (nextIndex >= playlist.value.length) {
      console.log('Reached end of playlist')
      stopPlaylistPlayback(true)  // Return to start when playlist completes
      return false
    }

    console.log('Moving to next segment in playlist, index:', nextIndex)
    playlistIndex.value = nextIndex
    const segment = currentPlaylistSegment.value
    if (segment) {
      console.log('Playing next segment:', segment.id)
      setCurrentTime(segment.startTime)
      selectCue(segment.id)
      return true
    }

    return false
  }

  /**
   * Cancel playlist playback due to manual intervention (e.g., scrubbing)
   * Returns to MEDIA_PLAYING mode without returning to start
   */
  function cancelPlaylistPlayback() {
    console.log('Canceling playlist playback due to manual intervention')
    playbackMode.value = PlaybackMode.MEDIA_PLAYING
    playlist.value = []
    playlistIndex.value = 0
    playlistStartIndex.value = 0
  }

  return {
    // State
    document,
    mediaPath,
    mediaFilePath,
    currentTime,
    isPlaying,
    selectedCueId,
    playbackMode,
    playlist,
    playlistIndex,
    playlistStartIndex,

    // Computed
    currentCue,
    currentPlaylistSegment,

    // Actions
    loadFromFile,
    loadMediaFile,
    exportToString,
    updateFilePath,
    addCue,
    updateCue,
    deleteCue,
    renameSpeaker,
    bulkSetSpeaker,
    bulkDeleteCues,
    splitSegmentAtWordIndex,
    mergeAdjacentSegments,
    setCurrentTime,
    setPlaying,
    selectCue,
    startPlaylistPlayback,
    stopPlaylistPlayback,
    nextPlaylistSegment,
    cancelPlaylistPlayback
  }
})
