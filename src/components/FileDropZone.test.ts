import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import FileDropZone from './FileDropZone.vue'
import { useVTTStore } from '../stores/vttStore'

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

describe('FileDropZone', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorageMock.clear()
  })

  describe('Electron file processing', () => {
    it('should process VTT files through Electron API', async () => {
      // Mock Electron API
      const mockProcessDroppedFiles = vi.fn().mockResolvedValue([
        {
          type: 'vtt',
          filePath: '/path/to/test.vtt',
          fileName: 'test.vtt',
          content: 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nTest caption'
        }
      ])

      global.window.electronAPI = {
        isElectron: true,
        openFile: vi.fn(),
        readFile: vi.fn(),
        saveFile: vi.fn(),
        saveExistingFile: vi.fn(),
        statFile: vi.fn(),
        fileToURL: vi.fn(),
        processDroppedFiles: mockProcessDroppedFiles,
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
        }
      }

      const wrapper = mount(FileDropZone)
      const store = useVTTStore()

      // Simulate Electron file drop
      const mockFilePaths = ['/path/to/test.vtt']
      const component = wrapper.vm as any
      await component.processElectronFiles(mockFilePaths)

      // Verify Electron API was called
      expect(mockProcessDroppedFiles).toHaveBeenCalledWith(mockFilePaths)

      // Verify VTT content was loaded into store
      expect(store.document.segments.length).toBe(1)
      expect(store.document.segments[0].text).toBe('Test caption')
      expect(store.document.filePath).toBe('/path/to/test.vtt')

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

      global.window.electronAPI = {
        isElectron: true,
        openFile: vi.fn(),
        readFile: vi.fn(),
        saveFile: vi.fn(),
        saveExistingFile: vi.fn(),
        statFile: vi.fn(),
        fileToURL: vi.fn(),
        processDroppedFiles: mockProcessDroppedFiles,
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
        }
      }

      const wrapper = mount(FileDropZone)
      const store = useVTTStore()

      // Simulate Electron media file drop
      const mockFilePaths = ['/path/to/video.mp4']
      const component = wrapper.vm as any
      await component.processElectronFiles(mockFilePaths)

      // Verify Electron API was called
      expect(mockProcessDroppedFiles).toHaveBeenCalledWith(mockFilePaths)

      // Verify media was loaded into store
      expect(store.mediaPath).toBe('file:///path/to/video.mp4')
      expect(store.mediaFilePath).toBe('/path/to/video.mp4')

      // Cleanup
      delete global.window.electronAPI
    })

    it('should process both VTT and media files in one drop', async () => {
      // Mock Electron API
      const mockProcessDroppedFiles = vi.fn().mockResolvedValue([
        {
          type: 'vtt',
          filePath: '/path/to/test.vtt',
          fileName: 'test.vtt',
          content: 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nTest caption'
        },
        {
          type: 'media',
          filePath: '/path/to/video.mp4',
          fileName: 'video.mp4',
          url: 'file:///path/to/video.mp4'
        }
      ])

      global.window.electronAPI = {
        isElectron: true,
        openFile: vi.fn(),
        readFile: vi.fn(),
        saveFile: vi.fn(),
        saveExistingFile: vi.fn(),
        statFile: vi.fn(),
        fileToURL: vi.fn(),
        processDroppedFiles: mockProcessDroppedFiles,
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
        }
      }

      const wrapper = mount(FileDropZone)
      const store = useVTTStore()

      // Simulate Electron drop with multiple files
      const mockFilePaths = ['/path/to/test.vtt', '/path/to/video.mp4']
      const component = wrapper.vm as any
      await component.processElectronFiles(mockFilePaths)

      // Verify both files were processed
      expect(mockProcessDroppedFiles).toHaveBeenCalledWith(mockFilePaths)
      expect(store.document.segments.length).toBe(1)
      expect(store.mediaPath).toBe('file:///path/to/video.mp4')

      // Cleanup
      delete global.window.electronAPI
    })

    it('should handle errors gracefully', async () => {
      // Mock console.error to avoid noise in test output
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

      // Mock Electron API to return invalid VTT
      const mockProcessDroppedFiles = vi.fn().mockResolvedValue([
        {
          type: 'vtt',
          filePath: '/path/to/bad.vtt',
          fileName: 'bad.vtt',
          content: 'This is not valid VTT content'
        }
      ])

      global.window.electronAPI = {
        isElectron: true,
        openFile: vi.fn(),
        readFile: vi.fn(),
        saveFile: vi.fn(),
        saveExistingFile: vi.fn(),
        statFile: vi.fn(),
        fileToURL: vi.fn(),
        processDroppedFiles: mockProcessDroppedFiles,
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
        }
      }

      const wrapper = mount(FileDropZone)
      const store = useVTTStore()

      // Simulate Electron drop with invalid VTT
      const mockFilePaths = ['/path/to/bad.vtt']
      const component = wrapper.vm as any
      await component.processElectronFiles(mockFilePaths)

      // Verify error was logged and alert shown
      expect(consoleErrorSpy).toHaveBeenCalled()
      expect(alertSpy).toHaveBeenCalled()
      expect(store.document.segments.length).toBe(0)

      // Cleanup
      consoleErrorSpy.mockRestore()
      alertSpy.mockRestore()
      delete global.window.electronAPI
    })

    it('should show alert for VTT files with duplicate UUIDs', async () => {
      // Mock console.error to avoid noise in test output
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

      // Mock Electron API to return VTT with duplicate IDs
      const vttWithDuplicates = `WEBVTT

duplicate-id
00:00:00.000 --> 00:00:02.000
First cue

duplicate-id
00:00:02.000 --> 00:00:04.000
Second cue with same ID`

      const mockProcessDroppedFiles = vi.fn().mockResolvedValue([
        {
          type: 'vtt',
          filePath: '/path/to/duplicates.vtt',
          fileName: 'duplicates.vtt',
          content: vttWithDuplicates
        }
      ])

      global.window.electronAPI = {
        isElectron: true,
        openFile: vi.fn(),
        readFile: vi.fn(),
        saveFile: vi.fn(),
        saveExistingFile: vi.fn(),
        statFile: vi.fn(),
        fileToURL: vi.fn(),
        processDroppedFiles: mockProcessDroppedFiles,
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
        }
      }

      const wrapper = mount(FileDropZone)
      const store = useVTTStore()

      // Simulate Electron drop with duplicate UUID VTT
      const mockFilePaths = ['/path/to/duplicates.vtt']
      const component = wrapper.vm as any
      await component.processElectronFiles(mockFilePaths)

      // Verify error was shown with specific message about duplicates
      expect(alertSpy).toHaveBeenCalled()
      const alertMessage = alertSpy.mock.calls[0][0]
      expect(alertMessage).toContain('duplicate cue ID')
      expect(alertMessage).toContain('duplicate-id')

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
      const mockOpenFile = vi.fn().mockResolvedValue(['/path/to/test.vtt'])
      const mockProcessDroppedFiles = vi.fn().mockResolvedValue([
        {
          type: 'vtt',
          filePath: '/path/to/test.vtt',
          fileName: 'test.vtt',
          content: 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nTest'
        }
      ])

      global.window.electronAPI = {
        isElectron: true,
        openFile: mockOpenFile,
        readFile: vi.fn(),
        saveFile: vi.fn(),
        saveExistingFile: vi.fn(),
        statFile: vi.fn(),
        fileToURL: vi.fn(),
        processDroppedFiles: mockProcessDroppedFiles,
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
        }
      }

      const wrapper = mount(FileDropZone)
      const component = wrapper.vm as any

      await component.triggerFileInput()

      // Verify Electron openFile was called
      expect(mockOpenFile).toHaveBeenCalledWith({
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'VTT Files', extensions: ['vtt'] },
          { name: 'Media Files', extensions: ['mp4', 'webm', 'ogg', 'mp3', 'wav', 'mov', 'm4a'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })

      // Verify files were processed
      expect(mockProcessDroppedFiles).toHaveBeenCalledWith(['/path/to/test.vtt'])

      // Cleanup
      delete global.window.electronAPI
    })
  })
})
