import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import FileDropZone from './FileDropZone.vue'
import { useCaptionStore } from '../stores/captionStore'

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

// Helper to create mock Electron API
function createMockElectronAPI(overrides = {}) {
  return {
    isElectron: true,
    openFile: vi.fn(),
    readFile: vi.fn(),
    saveFile: vi.fn(),
    saveExistingFile: vi.fn(),
    statFile: vi.fn(),
    fileToURL: vi.fn(),
    processDroppedFiles: vi.fn(),
    getPathForFile: vi.fn(),
    onFileOpen: vi.fn(),
    onFileDropped: vi.fn(),
    path: {
      dirname: vi.fn(),
      basename: vi.fn(),
      relative: vi.fn(),
      resolve: vi.fn(),
      isAbsolute: vi.fn(),
      normalize: vi.fn(),
      join: vi.fn()
    },
    ipcRenderer: {
      on: vi.fn(),
      send: vi.fn()
    },
    asr: {
      transcribe: vi.fn(),
      cancel: vi.fn(),
      onOutput: vi.fn(),
      onStarted: vi.fn()
    },
    updateAsrMenuEnabled: vi.fn(),
    ...overrides
  }
}

describe('FileDropZone', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorageMock.clear()
  })

  describe('Electron file processing', () => {
    it('should process captions JSON files through Electron API', async () => {
      // Mock Electron API
      const mockProcessDroppedFiles = vi.fn().mockResolvedValue([
        {
          type: 'captions_json',
          filePath: '/path/to/test.captions_json',
          fileName: 'test.captions_json',
          content: JSON.stringify({
            metadata: { id: 'doc_1' },
            segments: [{ id: 'seg_1', startTime: 1, endTime: 4, text: 'Test caption' }]
          })
        }
      ])

      global.window.electronAPI = createMockElectronAPI({
        processDroppedFiles: mockProcessDroppedFiles
      }) as any

      mount(FileDropZone)
      const store = useCaptionStore()

      // Simulate Electron file drop
      const mockFilePaths = ['/path/to/test.captions_json']
      await store.processFilePaths(mockFilePaths)

      // Verify Electron API was called
      expect(mockProcessDroppedFiles).toHaveBeenCalledWith(mockFilePaths)

      // Verify captions content was loaded into store
      expect(store.document.segments.length).toBe(1)
      expect(store.document.segments[0].text).toBe('Test caption')
      expect(store.document.filePath).toBe('/path/to/test.captions_json')

      // Cleanup
      delete global.window.electronAPI
    })

    it('should process media files through Electron API', async () => {
      // Mock Electron API
      const mockProcessDroppedFiles = vi.fn().mockResolvedValue([
        {
          type: 'media',
          filePath: '/path/to/video.mp4',
          fileName: 'video.mp4',
          url: 'file:///path/to/video.mp4'
        }
      ])

      global.window.electronAPI = createMockElectronAPI({
        processDroppedFiles: mockProcessDroppedFiles
      }) as any

      mount(FileDropZone)
      const store = useCaptionStore()

      // Simulate Electron media file drop
      const mockFilePaths = ['/path/to/video.mp4']
      await store.processFilePaths(mockFilePaths)

      // Verify Electron API was called
      expect(mockProcessDroppedFiles).toHaveBeenCalledWith(mockFilePaths)

      // Verify media was loaded into store
      expect(store.mediaPath).toBe('file:///path/to/video.mp4')
      expect(store.mediaFilePath).toBe('/path/to/video.mp4')

      // Cleanup
      delete global.window.electronAPI
    })

    it('should process both captions and media files in one drop', async () => {
      // Mock Electron API
      const mockProcessDroppedFiles = vi.fn().mockResolvedValue([
        {
          type: 'captions_json',
          filePath: '/path/to/test.captions_json',
          fileName: 'test.captions_json',
          content: JSON.stringify({
            metadata: { id: 'doc_1' },
            segments: [{ id: 'seg_1', startTime: 1, endTime: 4, text: 'Test caption' }]
          })
        },
        {
          type: 'media',
          filePath: '/path/to/video.mp4',
          fileName: 'video.mp4',
          url: 'file:///path/to/video.mp4'
        }
      ])

      global.window.electronAPI = createMockElectronAPI({
        processDroppedFiles: mockProcessDroppedFiles
      }) as any

      mount(FileDropZone)
      const store = useCaptionStore()

      // Simulate Electron drop with multiple files
      const mockFilePaths = ['/path/to/test.captions_json', '/path/to/video.mp4']
      await store.processFilePaths(mockFilePaths)

      // Verify both files were processed
      expect(mockProcessDroppedFiles).toHaveBeenCalledWith(mockFilePaths)
      expect(store.document.segments.length).toBe(1)
      expect(store.mediaPath).toBe('file:///path/to/video.mp4')

      // Cleanup
      delete global.window.electronAPI
    })

    it('should handle errors gracefully', async () => {
      // Mock console.error to avoid noise in test output
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => { })

      // Mock Electron API to return invalid captions JSON
      const mockProcessDroppedFiles = vi.fn().mockResolvedValue([
        {
          type: 'captions_json',
          filePath: '/path/to/bad.captions_json',
          fileName: 'bad.captions_json',
          content: '{not json'
        }
      ])

      global.window.electronAPI = createMockElectronAPI({
        processDroppedFiles: mockProcessDroppedFiles
      }) as any

      mount(FileDropZone)
      const store = useCaptionStore()

      // Simulate Electron drop with invalid captions JSON
      const mockFilePaths = ['/path/to/bad.captions_json']
      const result = await store.processFilePaths(mockFilePaths)

      // Verify error was logged and failure count is 1
      expect(result.failures).toBe(1)
      expect(consoleErrorSpy).toHaveBeenCalled()
      expect(store.document.segments.length).toBe(0)

      // Cleanup
      consoleErrorSpy.mockRestore()
      alertSpy.mockRestore()
      delete global.window.electronAPI
    })

    it('should show alert for captions files with duplicate segment IDs', async () => {
      // Mock console.error to avoid noise in test output
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => { })

      const captionsWithDuplicates = JSON.stringify({
        metadata: { id: 'doc_1' },
        segments: [
          { id: 'duplicate-id', startTime: 0, endTime: 2, text: 'First segment' },
          { id: 'duplicate-id', startTime: 2, endTime: 4, text: 'Second segment with same ID' }
        ]
      })

      const mockProcessDroppedFiles = vi.fn().mockResolvedValue([
        {
          type: 'captions_json',
          filePath: '/path/to/duplicates.captions_json',
          fileName: 'duplicates.captions_json',
          content: captionsWithDuplicates
        }
      ])

      global.window.electronAPI = createMockElectronAPI({
        processDroppedFiles: mockProcessDroppedFiles
      }) as any

      mount(FileDropZone)
      const store = useCaptionStore()

      // Simulate Electron drop with duplicate IDs
      const mockFilePaths = ['/path/to/duplicates.captions_json']
      const result = await store.processFilePaths(mockFilePaths)

      // Verify failure count is 1 and console error logged
      expect(result.failures).toBe(1)
      expect(consoleErrorSpy).toHaveBeenCalled()

      // Verify file was not loaded
      expect(store.document.segments.length).toBe(0)

      // Cleanup
      consoleErrorSpy.mockRestore()
      alertSpy.mockRestore()
      delete global.window.electronAPI
    })
  })

  describe('triggerFileInput method', () => {
    it('should call Electron openFile API when in Electron', async () => {
      const mockOpenFile = vi.fn().mockResolvedValue(['/path/to/test.captions_json'])
      const mockProcessDroppedFiles = vi.fn().mockResolvedValue([
        {
          type: 'captions_json',
          filePath: '/path/to/test.captions_json',
          fileName: 'test.captions_json',
          content: JSON.stringify({
            metadata: { id: 'doc_1' },
            segments: [{ id: 'seg_1', startTime: 1, endTime: 4, text: 'Test' }]
          })
        }
      ])

      global.window.electronAPI = createMockElectronAPI({
        openFile: mockOpenFile,
        processDroppedFiles: mockProcessDroppedFiles
      }) as any

      const wrapper = mount(FileDropZone)
      const component = wrapper.vm as any

      await component.triggerFileInput()

      // Verify Electron openFile was called
      expect(mockOpenFile).toHaveBeenCalledWith({
        properties: ['openFile', 'multiSelections']
      })

      // Verify files were processed
      expect(mockProcessDroppedFiles).toHaveBeenCalledWith(['/path/to/test.captions_json'])

      // Cleanup
      delete global.window.electronAPI
    })
  })
})
