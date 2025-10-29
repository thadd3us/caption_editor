import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
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

const STORAGE_KEY = 'vtt-editor-document'
const STORAGE_MEDIA_KEY = 'vtt-editor-media-path'
const STORAGE_MEDIA_FILEPATH_KEY = 'vtt-editor-media-filepath'

export const useVTTStore = defineStore('vtt', () => {
  // State
  const document = ref<VTTDocument>(createEmptyDocument())

  // Media URL used as the src attribute for <video> or <audio> elements
  // Examples: blob:http://localhost:3000/uuid, /tests/fixtures/file.wav, https://example.com/video.mp4
  const mediaPath = ref<string | null>(null)

  // Original file path for display purposes (e.g., in UI)
  // Examples: /home/user/videos/movie.mp4, C:\Users\Name\audio.wav, or just filename.wav
  // Note: In browsers, full paths are often unavailable due to security restrictions
  const mediaFilePath = ref<string | null>(null)

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

  // Actions
  function loadFromFile(content: string, filePath?: string) {
    console.log('Loading VTT from file:', filePath)
    const result = parseVTT(content)

    if (result.success && result.document) {
      document.value = {
        ...result.document,
        filePath
      }
      saveToLocalStorage()
      console.log('Loaded document with', document.value.cues.length, 'cues')
    } else {
      console.error('Failed to load VTT:', result.error)
      throw new Error(result.error || 'Failed to parse VTT file')
    }
  }

  /**
   * Load a media file for playback
   * @param path - URL to use as media element src (blob URL, HTTP URL, or file path)
   * @param filePath - Optional original file path for display in UI
   */
  function loadMediaFile(path: string, filePath?: string) {
    console.log('Loading media file:', path, 'with file path:', filePath)
    mediaPath.value = path
    mediaFilePath.value = filePath || null
    localStorage.setItem(STORAGE_MEDIA_KEY, path)
    if (filePath) {
      localStorage.setItem(STORAGE_MEDIA_FILEPATH_KEY, filePath)
    } else {
      localStorage.removeItem(STORAGE_MEDIA_FILEPATH_KEY)
    }
  }

  function exportToString(): string {
    console.log('Exporting VTT document')
    return serializeVTT(document.value)
  }

  function updateFilePath(filePath: string) {
    console.log('Updating file path:', filePath)
    document.value = {
      ...document.value,
      filePath
    }
    saveToLocalStorage()
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
    saveToLocalStorage()
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
    saveToLocalStorage()
  }

  function deleteCue(cueId: string) {
    console.log('Deleting cue:', cueId)
    document.value = deleteCueFromDoc(document.value, cueId)
    if (selectedCueId.value === cueId) {
      selectedCueId.value = null
    }
    saveToLocalStorage()
  }

  function clearDocument() {
    console.log('Clearing document')
    document.value = createEmptyDocument()
    mediaPath.value = null
    currentTime.value = 0
    isPlaying.value = false
    selectedCueId.value = null
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(STORAGE_MEDIA_KEY)
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

  // LocalStorage persistence
  function saveToLocalStorage() {
    try {
      const data = {
        document: {
          cues: document.value.cues,
          filePath: document.value.filePath,
          history: document.value.history
        },
        timestamp: Date.now()
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      console.log('Saved to localStorage')
    } catch (err) {
      console.error('Failed to save to localStorage:', err)
    }
  }

  function loadFromLocalStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const data = JSON.parse(stored)
        document.value = {
          cues: Object.freeze(data.document.cues),
          filePath: data.document.filePath,
          history: data.document.history
        }
        console.log('Loaded from localStorage:', document.value.cues.length, 'cues')
      }

      const storedMedia = localStorage.getItem(STORAGE_MEDIA_KEY)
      if (storedMedia) {
        mediaPath.value = storedMedia
        console.log('Loaded media path from localStorage:', storedMedia)
      }
    } catch (err) {
      console.error('Failed to load from localStorage:', err)
    }
  }

  // Auto-save on document changes
  watch(() => document.value, saveToLocalStorage, { deep: true })

  // Initialize from localStorage
  loadFromLocalStorage()

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
    clearDocument,
    setCurrentTime,
    setPlaying,
    selectCue,
    setSnippetMode
  }
})
