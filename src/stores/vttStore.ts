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
  /** Not playing - media is paused or stopped */
  STOPPED = 'STOPPED',
  /** Normal continuous playback - media plays forward normally */
  MEDIA_PLAYING = 'MEDIA_PLAYING',
  /** Playlist-based segment playback - plays specific segments in order */
  SEGMENTS_PLAYING = 'SEGMENTS_PLAYING'
}

export const useVTTStore = defineStore('vtt', () => {
  // State - all state lives in memory only, persisted by saving VTT files
  const document = ref<VTTDocument>(createEmptyDocument())

  // Media URL - always a media:// URL in Electron mode
  // Example: media:///Users/name/path/to/audio.wav
  const mediaPath = ref<string | null>(null)

  const currentTime = ref(0)
  const isPlaying = ref(false)  // Kept for compatibility with media element events
  const selectedCueId = ref<string | null>(null)

  // Playback mode state - single source of truth for playback status
  const playbackMode = ref<PlaybackMode>(PlaybackMode.STOPPED)

  // Playlist-based playback state (only used in SEGMENTS_PLAYING mode)
  const playlist = ref<string[]>([])  // Ordered list of segment IDs to play
  const playlistIndex = ref(0)  // Current position in the playlist
  const playlistStartIndex = ref(0)  // Starting position (for returning after completion)
  const isDirty = ref(false) // Track unsaved changes

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
      isDirty.value = false // Reset dirty flag on load
      console.log('Loaded document with', document.value.segments.length, 'segments')
    } else {
      console.error('Failed to load VTT:', result.error)
      throw new Error(result.error || 'Failed to parse VTT file')
    }
  }

  /**
   * Load a media file for playback (Electron mode)
   * @param path - media:// URL to use as media element src
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
      isDirty.value = true // Loading media changes metadata
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
    isDirty.value = true
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
    isDirty.value = true
  }

  function deleteCue(cueId: string) {
    console.log('Deleting segment:', cueId)
    document.value = deleteCueFromDoc(document.value, cueId)
    isDirty.value = true
    if (selectedCueId.value === cueId) {
      selectedCueId.value = null
    }
  }

  function renameSpeaker(oldName: string, newName: string) {
    console.log('Renaming speaker in store:', oldName, '->', newName)
    document.value = renameSpeakerInDoc(document.value, oldName, newName)
    isDirty.value = true
  }

  function bulkSetSpeaker(cueIds: string[], speakerName: string) {
    console.log('Bulk setting speaker for', cueIds.length, 'cues to:', speakerName)

    // Update each cue with the new speaker name
    let updatedDoc = document.value
    for (const cueId of cueIds) {
      updatedDoc = updateCueInDoc(updatedDoc, cueId, { speakerName })
    }

    document.value = updatedDoc
    isDirty.value = true
  }

  function bulkDeleteCues(cueIds: string[]) {
    console.log('Bulk deleting', cueIds.length, 'cues')

    // Delete each cue
    let updatedDoc = document.value
    for (const cueId of cueIds) {
      updatedDoc = deleteCueFromDoc(updatedDoc, cueId)
    }

    document.value = updatedDoc
    isDirty.value = true

    // Clear selectedCueId if it was deleted
    if (selectedCueId.value && cueIds.includes(selectedCueId.value)) {
      selectedCueId.value = null
    }
  }

  function splitSegmentAtWordIndex(segmentId: string, wordIndex: number) {
    console.log('Splitting segment in store:', segmentId, 'at word index:', wordIndex)
    document.value = splitSegmentInDoc(document.value, segmentId, wordIndex)
    isDirty.value = true
  }

  function mergeAdjacentSegments(segmentIds: string[]) {
    console.log('Merging adjacent segments in store:', segmentIds)
    document.value = mergeAdjacentSegmentsInDoc(document.value, segmentIds)
    isDirty.value = true
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
   * Stop playlist playback and return to STOPPED mode
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

    playbackMode.value = PlaybackMode.STOPPED
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
   * Returns to STOPPED mode without returning to start
   */
  function cancelPlaylistPlayback() {
    console.log('Canceling playlist playback due to manual intervention')
    playbackMode.value = PlaybackMode.STOPPED
    playlist.value = []
    playlistIndex.value = 0
    playlistStartIndex.value = 0
  }

  function setIsDirty(value: boolean) {
    isDirty.value = value
  }

  /**
   * Processes an array of file paths (VTT or media) and loads them into the store.
   * @param filePaths Array of absolute file paths to process
   * @returns Object containing counts of successes and failures
   */
  async function processFilePaths(filePaths: string[]): Promise<{ successes: number; failures: number }> {
    const electronAPI = (window as any).electronAPI
    if (!electronAPI || !electronAPI.processDroppedFiles) {
      console.error('Electron processDroppedFiles API not available')
      throw new Error('File processing API not available')
    }

    let successes = 0
    let failures = 0

    try {
      const results = await electronAPI.processDroppedFiles(filePaths)
      console.log('[vttStore] Processed file results:', results)

      for (const result of results) {
        try {
          if (result.type === 'vtt' && result.content) {
            loadFromFile(result.content, result.filePath)
            console.log('[vttStore] VTT file loaded successfully:', result.fileName)
            successes++
          } else if (result.type === 'media' && result.url) {
            loadMediaFile(result.url, result.filePath)
            console.log('[vttStore] Media file loaded successfully:', result.fileName)
            successes++
          }
        } catch (err) {
          console.error(`[vttStore] Failed to load file ${result.fileName}:`, err)
          failures++
        }
      }
    } catch (err) {
      console.error('[vttStore] Failed to process files:', err)
      failures = filePaths.length
    }

    return { successes, failures }
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
    isDirty,

    // Computed
    currentCue,
    currentPlaylistSegment,

    // Actions
    loadFromFile,
    loadMediaFile,
    exportToString,
    updateFilePath,
    setIsDirty,
    processFilePaths,
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
    cancelPlaylistPlayback,
    reset() {
      document.value = createEmptyDocument()
      mediaPath.value = null
      currentTime.value = 0
      isPlaying.value = false
      selectedCueId.value = null
      playbackMode.value = PlaybackMode.STOPPED
      playlist.value = []
      playlistIndex.value = 0
      playlistStartIndex.value = 0
      isDirty.value = false
    }
  }
})
