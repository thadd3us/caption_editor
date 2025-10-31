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
  }
})

// Handle file drop events
window.addEventListener('DOMContentLoaded', () => {
  console.log('[preload] Registered drop handler on document')
  document.addEventListener('drop', (e) => {
    console.log('[preload] Drop event received at document level')
    e.preventDefault()
    e.stopPropagation()

    // Extract file paths from dropped files
    const files = Array.from(e.dataTransfer?.files || [])
    console.log('[preload] Files in drop:', files.map(f => ({ name: f.name, path: (f as any).path })))
    const filePaths = files
      // @ts-ignore - path property exists in Electron
      .map(file => file.path)
      .filter(Boolean)

    console.log('[preload] Extracted file paths:', filePaths)

    if (filePaths.length > 0) {
      // Dispatch custom event with file paths
      console.log('[preload] Dispatching electron-files-dropped event')
      const event = new CustomEvent('electron-files-dropped', {
        detail: { filePaths }
      })
      window.dispatchEvent(event)
    } else {
      console.warn('[preload] No file paths found - file.path property not available')
    }
  })

  document.addEventListener('dragover', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })
})
