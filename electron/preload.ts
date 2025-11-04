import { contextBridge, ipcRenderer } from 'electron'

// Log version on startup
const APP_VERSION = '1.0.5'
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
   * Listen for files dropped (intercepted by main process)
   */
  onFileDropped: (callback: (filePaths: string[]) => void) => {
    console.log('[preload] Registering onFileDropped callback')
    ipcRenderer.on('file-dropped-from-main', (_event, filePaths) => {
      console.log('[preload] ✓ Received file-dropped-from-main IPC message')
      console.log('[preload] ✓ File paths received:', filePaths)
      console.log('[preload] ✓ Calling renderer callback with paths')
      callback(filePaths)
      console.log('[preload] ✓ Callback executed successfully')
    })
  }
})

// Handle file drop events
// With sandbox: false, we CAN access file.path property
window.addEventListener('DOMContentLoaded', () => {
  console.log('[preload] Registered drop handler on document')

  document.addEventListener('dragover', (e) => {
    e.preventDefault()
    e.stopPropagation()
    console.log('[preload] Dragover event - allowing drop')
  })

  document.addEventListener('drop', async (e) => {
    console.log('[preload] ✓ Drop event detected!')
    e.preventDefault()
    e.stopPropagation()

    const files = e.dataTransfer?.files
    console.log('[preload] ✓ Number of files dropped:', files?.length || 0)

    if (!files || files.length === 0) {
      console.log('[preload] ✗ No files in drop event')
      return
    }

    // With sandbox: false, file.path is available
    const filePaths: string[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const path = (file as any).path
      console.log('[preload] ✓ File', i, '- name:', file.name, 'path:', path, 'type:', file.type)
      if (path) {
        filePaths.push(path)
      } else {
        console.log('[preload] ✗ File has no path property! Sandbox might still be enabled.')
      }
    }

    console.log('[preload] ✓ Extracted file paths:', filePaths)

    if (filePaths.length > 0) {
      console.log('[preload] ✓ Triggering file processing with paths:', filePaths)
      // Send to main process to trigger the onFileDropped callback
      ipcRenderer.send('files-dropped-in-preload', filePaths)
      console.log('[preload] ✓ Sent IPC message to main process')
    } else {
      console.log('[preload] ✗ No valid file paths extracted')
    }
  })
})
