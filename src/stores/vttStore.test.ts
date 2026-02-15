import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCaptionStore } from './captionStore'

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
      const store = useCaptionStore()
      expect(store.document.segments).toHaveLength(0)
      expect(store.mediaPath).toBeNull()
      expect(store.currentTime).toBe(0)
      expect(store.isPlaying).toBe(false)
      expect(store.selectedCueId).toBeNull()
    })
  })

  describe('loadFromFile', () => {
    it('should load valid captions JSON content', () => {
      const store = useCaptionStore()
      const captionsJson = JSON.stringify({
        metadata: { id: 'doc_1' },
        segments: [{ id: 'seg_1', startTime: 1.0, endTime: 4.0, text: 'Test caption' }]
      })

      store.loadFromFile(captionsJson, '/test/file.captions.json')
      expect(store.document.segments).toHaveLength(1)
      expect(store.document.segments[0].text).toBe('Test caption')
      expect(store.document.filePath).toBe('/test/file.captions.json')
    })

    it('should throw error on invalid captions content', () => {
      const store = useCaptionStore()
      const invalidContent = '{not json'

      expect(() => store.loadFromFile(invalidContent)).toThrow()
    })
  })

  describe('loadMediaFile', () => {
    it('should set media path', () => {
      const store = useCaptionStore()
      store.loadMediaFile('/path/to/video.mp4')
      expect(store.mediaPath).toBe('/path/to/video.mp4')
    })
  })

  describe('exportToString', () => {
    it('should export document as captions JSON string', () => {
      const store = useCaptionStore()
      const captionsJson = JSON.stringify({
        metadata: { id: 'doc_1' },
        segments: [{ id: 'seg_1', startTime: 1.0, endTime: 4.0, text: 'Test caption' }]
      })

      store.loadFromFile(captionsJson)
      const exported = store.exportToString()

      const parsed = JSON.parse(exported)
      expect(parsed.metadata.id).toBe('doc_1')
      expect(parsed.segments).toHaveLength(1)
      expect(parsed.segments[0].text).toBe('Test caption')
    })
  })

  describe('addCue', () => {
    it('should add a new cue at specified time', () => {
      const store = useCaptionStore()
      const cueId = store.addCue(10, 5)

      expect(store.document.segments).toHaveLength(1)
      expect(store.document.segments[0].startTime).toBe(10)
      expect(store.document.segments[0].endTime).toBe(15)
      expect(store.document.segments[0].text).toBe('New caption')
      expect(store.document.segments[0].id).toBe(cueId)
    })

    it('should use default duration if not specified', () => {
      const store = useCaptionStore()
      store.addCue(10)

      expect(store.document.segments[0].endTime).toBe(15)
    })
  })

  describe('updateCue', () => {
    it('should update cue text', () => {
      const store = useCaptionStore()
      const cueId = store.addCue(10)

      store.updateCue(cueId, { text: 'Updated text' })
      expect(store.document.segments[0].text).toBe('Updated text')
    })

    it('should update cue timing', () => {
      const store = useCaptionStore()
      const cueId = store.addCue(10)

      store.updateCue(cueId, { startTime: 12, endTime: 18 })
      expect(store.document.segments[0].startTime).toBe(12)
      expect(store.document.segments[0].endTime).toBe(18)
    })

    it('should update cue rating', () => {
      const store = useCaptionStore()
      const cueId = store.addCue(10)

      store.updateCue(cueId, { rating: 5 })
      expect(store.document.segments[0].rating).toBe(5)
    })

    it('should throw error if endTime <= startTime', () => {
      const store = useCaptionStore()
      const cueId = store.addCue(10)

      expect(() => {
        store.updateCue(cueId, { startTime: 20, endTime: 15 })
      }).toThrow('End time must be greater than start time')
    })

    it('should throw error if startTime >= existing endTime', () => {
      const store = useCaptionStore()
      const cueId = store.addCue(10, 5) // endTime = 15

      expect(() => {
        store.updateCue(cueId, { startTime: 16 })
      }).toThrow('Start time must be less than end time')
    })

    it('should throw error if endTime <= existing startTime', () => {
      const store = useCaptionStore()
      const cueId = store.addCue(10, 5) // startTime = 10

      expect(() => {
        store.updateCue(cueId, { endTime: 9 })
      }).toThrow('End time must be greater than start time')
    })
  })

  describe('deleteCue', () => {
    it('should delete a cue', () => {
      const store = useCaptionStore()
      const cueId = store.addCue(10)

      store.deleteCue(cueId)
      expect(store.document.segments).toHaveLength(0)
    })

    it('should clear selectedCueId if deleting selected cue', () => {
      const store = useCaptionStore()
      const cueId = store.addCue(10)
      store.selectCue(cueId)

      store.deleteCue(cueId)
      expect(store.selectedCueId).toBeNull()
    })

    it('should not clear selectedCueId if deleting different cue', () => {
      const store = useCaptionStore()
      const cueId1 = store.addCue(10)
      const cueId2 = store.addCue(20)
      store.selectCue(cueId1)

      store.deleteCue(cueId2)
      expect(store.selectedCueId).toBe(cueId1)
    })
  })


  describe('setCurrentTime', () => {
    it('should update current time', () => {
      const store = useCaptionStore()
      store.setCurrentTime(42.5)
      expect(store.currentTime).toBe(42.5)
    })

    it('should auto-select current cue', () => {
      const store = useCaptionStore()
      const cueId = store.addCue(10, 10) // 10-20s

      store.setCurrentTime(15)
      expect(store.selectedCueId).toBe(cueId)
    })

    it('should not select if no cue at current time', () => {
      const store = useCaptionStore()
      store.addCue(10, 10) // 10-20s

      store.setCurrentTime(5)
      expect(store.selectedCueId).toBeNull()
    })
  })

  describe('setPlaying', () => {
    it('should update playing state', () => {
      const store = useCaptionStore()
      store.setPlaying(true)
      expect(store.isPlaying).toBe(true)

      store.setPlaying(false)
      expect(store.isPlaying).toBe(false)
    })
  })

  describe('selectCue', () => {
    it('should set selected cue ID', () => {
      const store = useCaptionStore()
      store.selectCue('test-id')
      expect(store.selectedCueId).toBe('test-id')
    })

    it('should allow null to deselect', () => {
      const store = useCaptionStore()
      store.selectCue('test-id')
      store.selectCue(null)
      expect(store.selectedCueId).toBeNull()
    })
  })

  describe('document.segments (always sorted)', () => {
    it('should keep cues sorted by start time', () => {
      const store = useCaptionStore()
      store.addCue(20)
      store.addCue(10)
      store.addCue(30)

      const cues = store.document.segments
      expect(cues[0].startTime).toBe(10)
      expect(cues[1].startTime).toBe(20)
      expect(cues[2].startTime).toBe(30)
    })

    it('should sort by end time when start times are equal', () => {
      const store = useCaptionStore()
      const id1 = store.addCue(10, 10) // 10-20
      store.updateCue(id1, { endTime: 20 })

      const id2 = store.addCue(10, 5) // 10-15
      store.updateCue(id2, { startTime: 10, endTime: 15 })

      const cues = store.document.segments
      expect(cues[0].endTime).toBe(15)
      expect(cues[1].endTime).toBe(20)
    })
  })

  describe('currentCue', () => {
    it('should return cue at current time', () => {
      const store = useCaptionStore()
      const cueId = store.addCue(10, 10) // 10-20s

      store.setCurrentTime(15)
      expect(store.currentCue?.id).toBe(cueId)
    })

    it('should return undefined if no cue at current time', () => {
      const store = useCaptionStore()
      store.addCue(10, 10) // 10-20s

      store.setCurrentTime(5)
      expect(store.currentCue).toBeUndefined()
    })

    it('should return first matching cue if multiple overlap', () => {
      const store = useCaptionStore()
      const cueId1 = store.addCue(10, 20) // 10-30s
      store.addCue(15, 10) // 15-25s

      store.setCurrentTime(20)
      expect(store.currentCue?.id).toBe(cueId1)
    })
  })

})
