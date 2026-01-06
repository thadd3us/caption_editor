export interface ElectronAPI {
  /**
   * Open file picker dialog
   */
  openFile: (options?: {
    filters?: Array<{ name: string; extensions: string[] }>,
    properties?: Array<'openFile' | 'multiSelections'>
  }) => Promise<string[] | null>

  /**
   * Read file contents
   */
  readFile: (filePath: string) => Promise<{
    success: boolean
    content?: string
    filePath?: string
    error?: string
  }>

  /**
   * Save file with dialog
   */
  saveFile: (options: {
    content: string
    defaultPath?: string
    suggestedName?: string
  }) => Promise<{
    success: boolean
    filePath?: string
    error?: string
  }>

  /**
   * Save to existing file path
   */
  saveExistingFile: (options: {
    filePath: string
    content: string
  }) => Promise<{
    success: boolean
    filePath?: string
    error?: string
  }>

  /**
   * Get file stats
   */
  statFile: (filePath: string) => Promise<{
    success: boolean
    exists?: boolean
    isFile?: boolean
    isDirectory?: boolean
    size?: number
    modified?: string
    error?: string
  }>

  /**
   * Convert file path to URL for media loading
   */
  fileToURL: (filePath: string) => Promise<{
    success: boolean
    url?: string
    filePath?: string
    error?: string
  }>

  /**
   * Process dropped files
   */
  processDroppedFiles: (filePaths: string[]) => Promise<Array<{
    type: 'vtt' | 'media'
    filePath: string
    fileName: string
    content?: string
    url?: string
  }>>

  /**
   * Get file path from File object (for drag-and-drop)
   */
  getPathForFile: (file: File) => string | null

  /**
   * Check if running in Electron
   */
  isElectron: boolean

  /**
   * Listen for files opened from the OS (double-click, right-click > Open With)
   */
  onFileOpen: (callback: (filePath: string) => void) => void

  /**
   * Listen for files dropped (intercepted by main process)
   */
  onFileDropped: (callback: (filePaths: string[]) => void) => void

  /**
   * Path utilities - Node.js path module functions
   */
  path: {
    dirname: (p: string) => string
    basename: (p: string) => string
    relative: (from: string, to: string) => string
    resolve: (...paths: string[]) => string
    isAbsolute: (p: string) => boolean
    normalize: (p: string) => string
    join: (...paths: string[]) => string
  }

  /**
   * IPC renderer for menu events and custom channels
   */
  ipcRenderer: {
    on: (channel: string, callback: () => void) => void
    send: (channel: string, ...args: any[]) => void
  }

  /**
   * ASR transcription APIs
   */
  asr: {
    transcribe: (options: { mediaFilePath: string, model?: string, chunkSize?: number }) => Promise<{
      success: boolean
      vttPath: string
      processId: string
      content?: string
      error?: string
      canceled?: boolean
    }>
    embed: (options: { vttPath: string, model?: string }) => Promise<{
      success: boolean
      content?: string
      error?: string
      canceled?: boolean
    }>
    cancel: (processId: string) => Promise<{
      success: boolean
      error?: string
    }>
    onOutput: (callback: (data: { processId: string, type: 'stdout' | 'stderr', data: string }) => void) => void
    onStarted: (callback: (data: { processId: string }) => void) => void
  }

  /**
   * Update ASR menu item enabled state
   */
  updateAsrMenuEnabled: (options: boolean | { caption?: boolean; embed?: boolean }) => void

  /**
   * Quit the application
   */
  quitApp: () => void

  /**
   * Listen for application close request
   */
  onAppClose: (callback: () => void) => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }

  interface WindowEventMap {
    'electron-files-dropped': CustomEvent<{ filePaths: string[] }>
  }
}

export { }
