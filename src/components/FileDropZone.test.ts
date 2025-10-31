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
        onFileOpen: vi.fn()
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
      expect(store.document.cues.length).toBe(1)
      expect(store.document.cues[0].text).toBe('Test caption')
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
        onFileOpen: vi.fn()
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
        onFileOpen: vi.fn()
      }

      const wrapper = mount(FileDropZone)
      const store = useVTTStore()

      // Simulate Electron drop with multiple files
      const mockFilePaths = ['/path/to/test.vtt', '/path/to/video.mp4']
      const component = wrapper.vm as any
      await component.processElectronFiles(mockFilePaths)

      // Verify both files were processed
      expect(mockProcessDroppedFiles).toHaveBeenCalledWith(mockFilePaths)
      expect(store.document.cues.length).toBe(1)
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
        onFileOpen: vi.fn()
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
      expect(store.document.cues.length).toBe(0)

      // Cleanup
      consoleErrorSpy.mockRestore()
      alertSpy.mockRestore()
      delete global.window.electronAPI
    })
  })

  describe('Browser file processing', () => {
    it('should process VTT files in browser mode', async () => {
      const wrapper = mount(FileDropZone)
      const store = useVTTStore()

      // Create mock File object with text() method
      const vttContent = 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nBrowser test caption'
      const mockFile = new File([vttContent], 'test.vtt', { type: 'text/vtt' })

      // Mock File.text() method for Node environment
      mockFile.text = vi.fn().mockResolvedValue(vttContent)

      // Simulate browser file processing
      const component = wrapper.vm as any
      await component.processFiles([mockFile])

      // Verify VTT was loaded
      expect(store.document.cues.length).toBe(1)
      expect(store.document.cues[0].text).toBe('Browser test caption')
    })

    it('should process media files in browser mode', async () => {
      const wrapper = mount(FileDropZone)
      const store = useVTTStore()

      // Mock URL.createObjectURL for Node environment
      global.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-blob-url')

      // Create mock media File object
      const mockFile = new File(['fake video data'], 'video.mp4', { type: 'video/mp4' })

      // Simulate browser file processing
      const component = wrapper.vm as any
      await component.processFiles([mockFile])

      // Verify media was loaded (URL.createObjectURL creates a blob URL)
      expect(store.mediaPath).toContain('blob:')
      expect(store.mediaPath).toBe('blob:http://localhost/mock-blob-url')
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
        onFileOpen: vi.fn()
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
