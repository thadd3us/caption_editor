import { contextBridge, ipcRenderer } from 'electron'

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
// NOTE: Due to sandbox limitations, file.path is not available on File objects
// The preload script must use IPC to get the main process to resolve file paths
window.addEventListener('DOMContentLoaded', () => {
  console.log('[preload] Registered drop handler on document')

  // Don't intercept drops at all - let them bubble to default handlers
  // The main process will intercept navigation events
  document.addEventListener('dragover', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })

  // Log drop events but don't prevent default - let navigation happen
  document.addEventListener('drop', (e) => {
    console.log('[preload] Drop event detected - allowing default navigation for main process to intercept')
    // Don't call e.preventDefault() - let it navigate so main process can intercept
  })
})
