import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import type { VTTDocument, VTTCue } from '../types/vtt'
import {
  parseVTT,
  serializeVTT,
  createEmptyDocument,
  addCue as addCueToDoc,
  updateCue as updateCueInDoc,
  deleteCue as deleteCueFromDoc,
  getCurrentTimestamp
} from '../utils/vttParser'

export const useVTTStore = defineStore('vtt', () => {
  // State - all state lives in memory only, persisted by saving VTT files
  const document = ref<VTTDocument>(createEmptyDocument())

  // Media URL - always a file:// URL in Electron mode
  // Example: file:///Users/name/path/to/audio.wav
  const mediaPath = ref<string | null>(null)

  const currentTime = ref(0)
  const isPlaying = ref(false)
  const selectedCueId = ref<string | null>(null)
  const snippetMode = ref(false)  // True when playing a single snippet, false for continuous playback

  // Computed
  const currentCue = computed(() => {
    const time = currentTime.value
    // document.cues is always kept sorted
    return document.value.cues.find(
      cue => cue.startTime <= time && time < cue.endTime
    )
  })

  // Computed property for mediaFilePath - single source of truth from document.metadata
  const mediaFilePath = computed(() => document.value.metadata.mediaFilePath || null)

  // Actions
  function loadFromFile(content: string, filePath?: string) {
    console.log('Loading VTT from file:', filePath)
    const result = parseVTT(content)

    if (result.success && result.document) {
      document.value = {
        ...result.document,
        filePath
      }
      console.log('Loaded document with', document.value.cues.length, 'cues')
    } else {
      console.error('Failed to load VTT:', result.error)
      throw new Error(result.error || 'Failed to parse VTT file')
    }
  }

  /**
   * Load a media file for playback (Electron mode)
   * @param path - file:// URL to use as media element src
   * @param filePath - Absolute file path to store in document metadata
   */
  function loadMediaFile(path: string, filePath?: string) {
    console.log('Loading media file:', path, 'with file path:', filePath)
    mediaPath.value = path

    // Store mediaFilePath in document metadata
    if (filePath) {
      // Convert to relative path if possible (relative to VTT file location)
      let mediaFilePathToStore = filePath

      if (document.value.filePath) {
        // Try to make the path relative to the VTT file's directory
        const vttDir = document.value.filePath.substring(0, Math.max(
          document.value.filePath.lastIndexOf('/'),
          document.value.filePath.lastIndexOf('\\')
        ))

        // Extract just the filename if the media file is in the same directory as the VTT
        if (mediaFilePathToStore.startsWith(vttDir)) {
          const relativePath = mediaFilePathToStore.substring(vttDir.length + 1)
          if (relativePath && !relativePath.includes('/') && !relativePath.includes('\\')) {
            // It's in the same directory, just use the filename
            mediaFilePathToStore = relativePath
          }
        }
      }

      document.value = {
        ...document.value,
        metadata: {
          ...document.value.metadata,
          mediaFilePath: mediaFilePathToStore
        }
      }
    }
  }

  function exportToString(): string {
    console.log('Exporting VTT document')
    // mediaFilePath is already in document.metadata, just serialize directly
    return serializeVTT(document.value)
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
    const newCue: VTTCue = {
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

  function updateCue(cueId: string, updates: Partial<Omit<VTTCue, 'id'>>) {
    console.log('Updating cue:', cueId, updates)

    // Validate timestamps if provided
    if (updates.startTime !== undefined && updates.endTime !== undefined) {
      if (updates.endTime <= updates.startTime) {
        throw new Error('End time must be greater than start time')
      }
    } else if (updates.startTime !== undefined) {
      const cue = document.value.cues.find(c => c.id === cueId)
      if (cue && updates.startTime >= cue.endTime) {
        throw new Error('Start time must be less than end time')
      }
    } else if (updates.endTime !== undefined) {
      const cue = document.value.cues.find(c => c.id === cueId)
      if (cue && updates.endTime <= cue.startTime) {
        throw new Error('End time must be greater than start time')
      }
    }

    document.value = updateCueInDoc(document.value, cueId, updates)
  }

  function deleteCue(cueId: string) {
    console.log('Deleting cue:', cueId)
    document.value = deleteCueFromDoc(document.value, cueId)
    if (selectedCueId.value === cueId) {
      selectedCueId.value = null
    }
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

  function setSnippetMode(enabled: boolean) {
    snippetMode.value = enabled
  }

  return {
    // State
    document,
    mediaPath,
    mediaFilePath,
    currentTime,
    isPlaying,
    selectedCueId,
    snippetMode,

    // Computed
    currentCue,

    // Actions
    loadFromFile,
    loadMediaFile,
    exportToString,
    updateFilePath,
    addCue,
    updateCue,
    deleteCue,
    setCurrentTime,
    setPlaying,
    selectCue,
    setSnippetMode
  }
})
