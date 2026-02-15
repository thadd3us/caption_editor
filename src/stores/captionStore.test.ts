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

describe('captionStore', () => {
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
      expect(store.selectedSegmentId).toBeNull()
    })
  })

  describe('loadFromFile', () => {
    it('should load valid captions JSON content', () => {
      const store = useCaptionStore()
      const captionsJson = JSON.stringify({
        metadata: { id: 'doc_1' },
        segments: [{ id: 'seg_1', startTime: 1.0, endTime: 4.0, text: 'Test caption' }]
      })

      store.loadFromFile(captionsJson, '/test/file.captions_json')
      expect(store.document.segments).toHaveLength(1)
      expect(store.document.segments[0].text).toBe('Test caption')
      expect(store.document.filePath).toBe('/test/file.captions_json')
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

  describe('addSegment', () => {
    it('should add a new segment at specified time', () => {
      const store = useCaptionStore()
      const segmentId = store.addSegment(10, 5)

      expect(store.document.segments).toHaveLength(1)
      expect(store.document.segments[0].startTime).toBe(10)
      expect(store.document.segments[0].endTime).toBe(15)
      expect(store.document.segments[0].text).toBe('New caption')
      expect(store.document.segments[0].id).toBe(segmentId)
    })

    it('should use default duration if not specified', () => {
      const store = useCaptionStore()
      store.addSegment(10)

      expect(store.document.segments[0].endTime).toBe(15)
    })
  })

  describe('updateSegment', () => {
    it('should update segment text', () => {
      const store = useCaptionStore()
      const segmentId = store.addSegment(10)

      store.updateSegment(segmentId, { text: 'Updated text' })
      expect(store.document.segments[0].text).toBe('Updated text')
    })

    it('should update segment timing', () => {
      const store = useCaptionStore()
      const segmentId = store.addSegment(10)

      store.updateSegment(segmentId, { startTime: 12, endTime: 18 })
      expect(store.document.segments[0].startTime).toBe(12)
      expect(store.document.segments[0].endTime).toBe(18)
    })

    it('should update segment rating', () => {
      const store = useCaptionStore()
      const segmentId = store.addSegment(10)

      store.updateSegment(segmentId, { rating: 5 })
      expect(store.document.segments[0].rating).toBe(5)
    })

    it('should throw error if endTime <= startTime', () => {
      const store = useCaptionStore()
      const segmentId = store.addSegment(10)

      expect(() => {
        store.updateSegment(segmentId, { startTime: 20, endTime: 15 })
      }).toThrow('End time must be greater than start time')
    })

    it('should throw error if startTime >= existing endTime', () => {
      const store = useCaptionStore()
      const segmentId = store.addSegment(10, 5) // endTime = 15

      expect(() => {
        store.updateSegment(segmentId, { startTime: 16 })
      }).toThrow('Start time must be less than end time')
    })

    it('should throw error if endTime <= existing startTime', () => {
      const store = useCaptionStore()
      const segmentId = store.addSegment(10, 5) // startTime = 10

      expect(() => {
        store.updateSegment(segmentId, { endTime: 9 })
      }).toThrow('End time must be greater than start time')
    })
  })

  describe('deleteSegment', () => {
    it('should delete a segment', () => {
      const store = useCaptionStore()
      const segmentId = store.addSegment(10)

      store.deleteSegment(segmentId)
      expect(store.document.segments).toHaveLength(0)
    })

    it('should clear selectedSegmentId if deleting selected segment', () => {
      const store = useCaptionStore()
      const segmentId = store.addSegment(10)
      store.selectSegment(segmentId)

      store.deleteSegment(segmentId)
      expect(store.selectedSegmentId).toBeNull()
    })

    it('should not clear selectedSegmentId if deleting different segment', () => {
      const store = useCaptionStore()
      const segmentId1 = store.addSegment(10)
      const segmentId2 = store.addSegment(20)
      store.selectSegment(segmentId1)

      store.deleteSegment(segmentId2)
      expect(store.selectedSegmentId).toBe(segmentId1)
    })
  })


  describe('setCurrentTime', () => {
    it('should update current time', () => {
      const store = useCaptionStore()
      store.setCurrentTime(42.5)
      expect(store.currentTime).toBe(42.5)
    })

    it('should auto-select current segment', () => {
      const store = useCaptionStore()
      const segmentId = store.addSegment(10, 10) // 10-20s

      store.setCurrentTime(15)
      expect(store.selectedSegmentId).toBe(segmentId)
    })

    it('should not select if no segment at current time', () => {
      const store = useCaptionStore()
      store.addSegment(10, 10) // 10-20s

      store.setCurrentTime(5)
      expect(store.selectedSegmentId).toBeNull()
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

  describe('selectSegment', () => {
    it('should set selected segment ID', () => {
      const store = useCaptionStore()
      store.selectSegment('test-id')
      expect(store.selectedSegmentId).toBe('test-id')
    })

    it('should allow null to deselect', () => {
      const store = useCaptionStore()
      store.selectSegment('test-id')
      store.selectSegment(null)
      expect(store.selectedSegmentId).toBeNull()
    })
  })

  describe('document.segments (always sorted)', () => {
    it('should keep segments sorted by start time', () => {
      const store = useCaptionStore()
      store.addSegment(20)
      store.addSegment(10)
      store.addSegment(30)

      const segments = store.document.segments
      expect(segments[0].startTime).toBe(10)
      expect(segments[1].startTime).toBe(20)
      expect(segments[2].startTime).toBe(30)
    })

    it('should sort by end time when start times are equal', () => {
      const store = useCaptionStore()
      const id1 = store.addSegment(10, 10) // 10-20
      store.updateSegment(id1, { endTime: 20 })

      const id2 = store.addSegment(10, 5) // 10-15
      store.updateSegment(id2, { startTime: 10, endTime: 15 })

      const segments = store.document.segments
      expect(segments[0].endTime).toBe(15)
      expect(segments[1].endTime).toBe(20)
    })
  })

  describe('currentSegment', () => {
    it('should return segment at current time', () => {
      const store = useCaptionStore()
      const segmentId = store.addSegment(10, 10) // 10-20s

      store.setCurrentTime(15)
      expect(store.currentSegment?.id).toBe(segmentId)
    })

    it('should return undefined if no segment at current time', () => {
      const store = useCaptionStore()
      store.addSegment(10, 10) // 10-20s

      store.setCurrentTime(5)
      expect(store.currentSegment).toBeUndefined()
    })

    it('should return first matching segment if multiple overlap', () => {
      const store = useCaptionStore()
      const segmentId1 = store.addSegment(10, 20) // 10-30s
      store.addSegment(15, 10) // 15-25s

      store.setCurrentTime(20)
      expect(store.currentSegment?.id).toBe(segmentId1)
    })
  })

})
