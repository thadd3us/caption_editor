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
   * Check if running in Electron
   */
  isElectron: boolean
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }

  interface WindowEventMap {
    'electron-files-dropped': CustomEvent<{ filePaths: string[] }>
  }
}

export {}
