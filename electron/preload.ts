import { contextBridge, ipcRenderer } from 'electron'
import { readFileSync } from 'fs'
import * as path from 'path'

// Read version from package.json (single source of truth)
const packageJsonPath = path.join(__dirname, '../package.json')
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
const APP_VERSION = packageJson.version

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
// With webSecurity: false and sandbox: false, file.path should be available
window.addEventListener('DOMContentLoaded', () => {
  console.log('[preload] Registered drop handler on document')

  document.addEventListener('dragover', (e) => {
    e.preventDefault()
    e.stopPropagation()
    console.log('[preload] Dragover event - allowing drop')
  })

  document.addEventListener('drop', async (e) => {
    e.preventDefault()
    e.stopPropagation()

    console.log('[preload] ✓ Drop event detected!')

    const files = e.dataTransfer?.files
    console.log('[preload] ✓ Number of files dropped:', files?.length || 0)

    if (!files || files.length === 0) {
      console.log('[preload] ✗ No files in drop event')
      return
    }

    // With webSecurity: false, file.path should now be available
    const filePaths: string[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const path = (file as any).path
      console.log('[preload] File', i, ':', {
        name: file.name,
        type: file.type,
        size: file.size,
        path: path
      })

      if (path) {
        filePaths.push(path)
        console.log('[preload]   ✓ Got path:', path)
      } else {
        console.log('[preload]   ✗ No path property (webSecurity might still be blocking)')
      }
    }

    if (filePaths.length > 0) {
      console.log('[preload] ✓ Extracted', filePaths.length, 'file paths')
      console.log('[preload] ✓ Sending to main process:', filePaths)
      ipcRenderer.send('files-dropped-in-preload', filePaths)
      console.log('[preload] ✓ IPC message sent')
    } else {
      console.log('[preload] ✗ No valid file paths extracted')
    }
  })
})
