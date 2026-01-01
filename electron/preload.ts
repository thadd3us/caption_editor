import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { readFileSync } from 'fs'
import * as path from 'path'
import { APP_VERSION } from './constants'

// Log version on startup
console.log(`[preload] VTT Caption Editor v${APP_VERSION} - Preload script loaded`)

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Open file picker dialog
   */
  openFile: (options?: {
    filters?: Array<{ name: string; extensions: string[] }>,
    properties?: Array<'openFile' | 'multiSelections'>
  }) => ipcRenderer.invoke('dialog:openFile', options),

  /**
   * Read file contents
   */
  readFile: (filePath: string) => ipcRenderer.invoke('file:read', filePath),

  /**
   * Save file with dialog
   */
  saveFile: (options: {
    content: string,
    defaultPath?: string,
    suggestedName?: string
  }) => ipcRenderer.invoke('file:save', options),

  /**
   * Save to existing file path
   */
  saveExistingFile: (options: {
    filePath: string,
    content: string
  }) => ipcRenderer.invoke('file:saveExisting', options),

  /**
   * Get file stats
   */
  statFile: (filePath: string) => ipcRenderer.invoke('file:stat', filePath),

  /**
   * Convert file path to URL for media loading
   */
  fileToURL: (filePath: string) => ipcRenderer.invoke('file:toURL', filePath),

  /**
   * Process dropped files
   */
  processDroppedFiles: (filePaths: string[]) => ipcRenderer.invoke('file:processDroppedFiles', filePaths),

  /**
   * Get file path from File object (for drag-and-drop)
   * Uses webUtils.getPathForFile() which is the only way to get paths in modern Electron
   */
  getPathForFile: (file: File) => {
    try {
      return webUtils.getPathForFile(file)
    } catch (err) {
      console.error('[preload] Error getting path for file:', err)
      return null
    }
  },

  /**
   * Check if running in Electron
   */
  isElectron: true,

  /**
   * Listen for files opened from the OS (double-click, right-click > Open With)
   */
  onFileOpen: (callback: (filePath: string) => void) => {
    ipcRenderer.on('open-file', (_event, filePath) => callback(filePath))
  },

  /**
   * Path utilities - expose Node.js path module functions for use in renderer
   */
  path: {
    dirname: (p: string) => path.dirname(p),
    basename: (p: string) => path.basename(p),
    relative: (from: string, to: string) => path.relative(from, to),
    resolve: (...paths: string[]) => path.resolve(...paths),
    isAbsolute: (p: string) => path.isAbsolute(p),
    normalize: (p: string) => path.normalize(p),
    join: (...paths: string[]) => path.join(...paths)
  },

  /**
   * IPC renderer for menu events
   */
  ipcRenderer: {
    on: (channel: string, callback: () => void) => {
      ipcRenderer.on(channel, callback)
    },
    send: (channel: string, ...args: any[]) => {
      ipcRenderer.send(channel, ...args)
    }
  },

  /**
   * ASR transcription APIs
   */
  asr: {
    transcribe: (options: { mediaFilePath: string, model?: string, chunkSize?: number }) =>
      ipcRenderer.invoke('asr:transcribe', options),
    embed: (options: { vttPath: string, model?: string }) =>
      ipcRenderer.invoke('asr:embed', options),
    cancel: (processId: string) =>
      ipcRenderer.invoke('asr:cancel', processId),
    onOutput: (callback: (data: { processId: string, type: 'stdout' | 'stderr', data: string }) => void) => {
      ipcRenderer.on('asr:output', (_event, data) => callback(data))
    },
    onStarted: (callback: (data: { processId: string }) => void) => {
      ipcRenderer.on('asr:started', (_event, data) => callback(data))
    }
  },

  /**
   * Update menu enabled/disabled state
   */
  updateAsrMenuEnabled: (options: boolean | { caption?: boolean; embed?: boolean }) => {
    ipcRenderer.send('menu:updateAsrEnabled', options)
  }
})

// Handle file drop events using webUtils.getPathForFile()
window.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('dragover', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })

  document.addEventListener('drop', async (e) => {
    e.preventDefault()
    e.stopPropagation()

    const files = e.dataTransfer?.files
    if (!files || files.length === 0) {
      return
    }

    // Extract file paths using webUtils
    const filePaths: string[] = []
    for (let i = 0; i < files.length; i++) {
      try {
        const filePath = webUtils.getPathForFile(files[i])
        filePaths.push(filePath)
      } catch (err) {
        console.error('[preload] Error getting path for file:', err)
      }
    }

    if (filePaths.length > 0) {
      ipcRenderer.send('files-dropped', filePaths)
    }
  })
})
