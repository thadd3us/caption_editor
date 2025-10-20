import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useVTTStore } from './vttStore'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString()
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    }
  }
})()

global.localStorage = localStorageMock as any

describe('vttStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorageMock.clear()
  })

  describe('initialization', () => {
    it('should initialize with empty document', () => {
      const store = useVTTStore()
      expect(store.document.cues).toHaveLength(0)
      expect(store.mediaPath).toBeNull()
      expect(store.currentTime).toBe(0)
      expect(store.isPlaying).toBe(false)
      expect(store.selectedCueId).toBeNull()
    })

    it('should load from localStorage if available', () => {
      localStorageMock.setItem('vtt-editor-document', JSON.stringify({
        document: {
          cues: [{
            id: 'test-id',
            startTime: 1,
            endTime: 4,
            text: 'Test caption'
          }]
        },
        timestamp: Date.now()
      }))

      const store = useVTTStore()
      expect(store.document.cues).toHaveLength(1)
      expect(store.document.cues[0].text).toBe('Test caption')
    })

    it('should load media path from localStorage', () => {
      localStorageMock.setItem('vtt-editor-media-path', '/path/to/media.mp4')

      const store = useVTTStore()
      expect(store.mediaPath).toBe('/path/to/media.mp4')
    })
  })

  describe('loadFromFile', () => {
    it('should load valid VTT content', () => {
      const store = useVTTStore()
      const vttContent = `WEBVTT

00:00:01.000 --> 00:00:04.000
Test caption`

      store.loadFromFile(vttContent, '/test/file.vtt')
      expect(store.document.cues).toHaveLength(1)
      expect(store.document.cues[0].text).toBe('Test caption')
      expect(store.document.filePath).toBe('/test/file.vtt')
    })

    it('should throw error on invalid VTT content', () => {
      const store = useVTTStore()
      const invalidContent = 'Not a VTT file'

      expect(() => store.loadFromFile(invalidContent)).toThrow()
    })

    it('should save to localStorage after loading', () => {
      const store = useVTTStore()
      const vttContent = `WEBVTT

00:00:01.000 --> 00:00:04.000
Test caption`

      store.loadFromFile(vttContent)
      const stored = localStorageMock.getItem('vtt-editor-document')
      expect(stored).not.toBeNull()

      const parsed = JSON.parse(stored!)
      expect(parsed.document.cues).toHaveLength(1)
    })
  })

  describe('loadMediaFile', () => {
    it('should set media path', () => {
      const store = useVTTStore()
      store.loadMediaFile('/path/to/video.mp4')
      expect(store.mediaPath).toBe('/path/to/video.mp4')
    })

    it('should save media path to localStorage', () => {
      const store = useVTTStore()
      store.loadMediaFile('/path/to/video.mp4')

      const stored = localStorageMock.getItem('vtt-editor-media-path')
      expect(stored).toBe('/path/to/video.mp4')
    })
  })

  describe('exportToString', () => {
    it('should export document as VTT string', () => {
      const store = useVTTStore()
      const vttContent = `WEBVTT

00:00:01.000 --> 00:00:04.000
Test caption`

      store.loadFromFile(vttContent)
      const exported = store.exportToString()

      expect(exported).toContain('WEBVTT')
      expect(exported).toContain('Test caption')
      expect(exported).toContain('00:00:01.000 --> 00:00:04.000')
    })
  })

  describe('addCue', () => {
    it('should add a new cue at specified time', () => {
      const store = useVTTStore()
      const cueId = store.addCue(10, 5)

      expect(store.document.cues).toHaveLength(1)
      expect(store.document.cues[0].startTime).toBe(10)
      expect(store.document.cues[0].endTime).toBe(15)
      expect(store.document.cues[0].text).toBe('New caption')
      expect(store.document.cues[0].id).toBe(cueId)
    })

    it('should use default duration if not specified', () => {
      const store = useVTTStore()
      store.addCue(10)

      expect(store.document.cues[0].endTime).toBe(15)
    })

    it('should save to localStorage after adding', () => {
      const store = useVTTStore()
      store.addCue(10)

      const stored = localStorageMock.getItem('vtt-editor-document')
      expect(stored).not.toBeNull()
    })
  })

  describe('updateCue', () => {
    it('should update cue text', () => {
      const store = useVTTStore()
      const cueId = store.addCue(10)

      store.updateCue(cueId, { text: 'Updated text' })
      expect(store.document.cues[0].text).toBe('Updated text')
    })

    it('should update cue timing', () => {
      const store = useVTTStore()
      const cueId = store.addCue(10)

      store.updateCue(cueId, { startTime: 12, endTime: 18 })
      expect(store.document.cues[0].startTime).toBe(12)
      expect(store.document.cues[0].endTime).toBe(18)
    })

    it('should update cue rating', () => {
      const store = useVTTStore()
      const cueId = store.addCue(10)

      store.updateCue(cueId, { rating: 5 })
      expect(store.document.cues[0].rating).toBe(5)
    })

    it('should throw error if endTime <= startTime', () => {
      const store = useVTTStore()
      const cueId = store.addCue(10)

      expect(() => {
        store.updateCue(cueId, { startTime: 20, endTime: 15 })
      }).toThrow('End time must be greater than start time')
    })

    it('should throw error if startTime >= existing endTime', () => {
      const store = useVTTStore()
      const cueId = store.addCue(10, 5) // endTime = 15

      expect(() => {
        store.updateCue(cueId, { startTime: 16 })
      }).toThrow('Start time must be less than end time')
    })

    it('should throw error if endTime <= existing startTime', () => {
      const store = useVTTStore()
      const cueId = store.addCue(10, 5) // startTime = 10

      expect(() => {
        store.updateCue(cueId, { endTime: 9 })
      }).toThrow('End time must be greater than start time')
    })

    it('should save to localStorage after updating', () => {
      const store = useVTTStore()
      const cueId = store.addCue(10)

      store.updateCue(cueId, { text: 'Updated' })

      const stored = localStorageMock.getItem('vtt-editor-document')
      const parsed = JSON.parse(stored!)
      expect(parsed.document.cues[0].text).toBe('Updated')
    })
  })

  describe('deleteCue', () => {
    it('should delete a cue', () => {
      const store = useVTTStore()
      const cueId = store.addCue(10)

      store.deleteCue(cueId)
      expect(store.document.cues).toHaveLength(0)
    })

    it('should clear selectedCueId if deleting selected cue', () => {
      const store = useVTTStore()
      const cueId = store.addCue(10)
      store.selectCue(cueId)

      store.deleteCue(cueId)
      expect(store.selectedCueId).toBeNull()
    })

    it('should not clear selectedCueId if deleting different cue', () => {
      const store = useVTTStore()
      const cueId1 = store.addCue(10)
      const cueId2 = store.addCue(20)
      store.selectCue(cueId1)

      store.deleteCue(cueId2)
      expect(store.selectedCueId).toBe(cueId1)
    })

    it('should save to localStorage after deleting', () => {
      const store = useVTTStore()
      const cueId = store.addCue(10)

      store.deleteCue(cueId)

      const stored = localStorageMock.getItem('vtt-editor-document')
      const parsed = JSON.parse(stored!)
      expect(parsed.document.cues).toHaveLength(0)
    })
  })

  describe('clearDocument', () => {
    it('should clear all document data', () => {
      const store = useVTTStore()
      store.addCue(10)
      store.loadMediaFile('/path/to/video.mp4')
      store.setCurrentTime(5)
      store.setPlaying(true)
      store.selectCue('test-id')

      store.clearDocument()

      expect(store.document.cues).toHaveLength(0)
      expect(store.mediaPath).toBeNull()
      expect(store.currentTime).toBe(0)
      expect(store.isPlaying).toBe(false)
      expect(store.selectedCueId).toBeNull()
    })

    it('should remove data from localStorage', () => {
      const store = useVTTStore()
      store.addCue(10)
      store.loadMediaFile('/path/to/video.mp4')

      store.clearDocument()

      expect(localStorageMock.getItem('vtt-editor-document')).toBeNull()
      expect(localStorageMock.getItem('vtt-editor-media-path')).toBeNull()
    })
  })

  describe('setCurrentTime', () => {
    it('should update current time', () => {
      const store = useVTTStore()
      store.setCurrentTime(42.5)
      expect(store.currentTime).toBe(42.5)
    })

    it('should auto-select current cue', () => {
      const store = useVTTStore()
      const cueId = store.addCue(10, 10) // 10-20s

      store.setCurrentTime(15)
      expect(store.selectedCueId).toBe(cueId)
    })

    it('should not select if no cue at current time', () => {
      const store = useVTTStore()
      store.addCue(10, 10) // 10-20s

      store.setCurrentTime(5)
      expect(store.selectedCueId).toBeNull()
    })
  })

  describe('setPlaying', () => {
    it('should update playing state', () => {
      const store = useVTTStore()
      store.setPlaying(true)
      expect(store.isPlaying).toBe(true)

      store.setPlaying(false)
      expect(store.isPlaying).toBe(false)
    })
  })

  describe('selectCue', () => {
    it('should set selected cue ID', () => {
      const store = useVTTStore()
      store.selectCue('test-id')
      expect(store.selectedCueId).toBe('test-id')
    })

    it('should allow null to deselect', () => {
      const store = useVTTStore()
      store.selectCue('test-id')
      store.selectCue(null)
      expect(store.selectedCueId).toBeNull()
    })
  })

  describe('document.cues (always sorted)', () => {
    it('should keep cues sorted by start time', () => {
      const store = useVTTStore()
      store.addCue(20)
      store.addCue(10)
      store.addCue(30)

      const cues = store.document.cues
      expect(cues[0].startTime).toBe(10)
      expect(cues[1].startTime).toBe(20)
      expect(cues[2].startTime).toBe(30)
    })

    it('should sort by end time when start times are equal', () => {
      const store = useVTTStore()
      const id1 = store.addCue(10, 10) // 10-20
      store.updateCue(id1, { endTime: 20 })

      const id2 = store.addCue(10, 5) // 10-15
      store.updateCue(id2, { startTime: 10, endTime: 15 })

      const cues = store.document.cues
      expect(cues[0].endTime).toBe(15)
      expect(cues[1].endTime).toBe(20)
    })
  })

  describe('currentCue', () => {
    it('should return cue at current time', () => {
      const store = useVTTStore()
      const cueId = store.addCue(10, 10) // 10-20s

      store.setCurrentTime(15)
      expect(store.currentCue?.id).toBe(cueId)
    })

    it('should return undefined if no cue at current time', () => {
      const store = useVTTStore()
      store.addCue(10, 10) // 10-20s

      store.setCurrentTime(5)
      expect(store.currentCue).toBeUndefined()
    })

    it('should return first matching cue if multiple overlap', () => {
      const store = useVTTStore()
      const cueId1 = store.addCue(10, 20) // 10-30s
      store.addCue(15, 10) // 15-25s

      store.setCurrentTime(20)
      expect(store.currentCue?.id).toBe(cueId1)
    })
  })

  describe('localStorage error handling', () => {
    it('should handle localStorage save errors gracefully', () => {
      const store = useVTTStore()

      // Mock localStorage.setItem to throw an error
      const originalSetItem = localStorageMock.setItem
      localStorageMock.setItem = () => {
        throw new Error('Storage quota exceeded')
      }

      // Should not throw
      expect(() => store.addCue(10)).not.toThrow()

      // Restore
      localStorageMock.setItem = originalSetItem
    })

    it('should handle localStorage load errors gracefully', () => {
      localStorageMock.setItem('vtt-editor-document', 'invalid json')

      // Should not throw during initialization
      expect(() => useVTTStore()).not.toThrow()
    })
  })
})
