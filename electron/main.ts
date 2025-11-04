import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import * as path from 'path'
import * as fs from 'fs/promises'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Store security-scoped bookmarks for macOS
const fileBookmarks = new Map<string, Buffer>()

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false  // Disabled to allow file.path property in drag-and-drop
    }
  })

  // In development, load from Vite dev server
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    // In production, load from built files
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Send any pending file to open once the window is ready
  mainWindow.webContents.on('did-finish-load', () => {
    if (fileToOpen && mainWindow) {
      mainWindow.webContents.send('open-file', fileToOpen)
      fileToOpen = null
    }
  })

  // Handle file drops - intercept at main process level to get full paths
  mainWindow.webContents.session.on('will-download', (event, item) => {
    // Prevent downloads from file drops
    event.preventDefault()
  })

  // Intercept file drops using webContents
  mainWindow.webContents.on('will-navigate', (event, url) => {
    console.log('[main] will-navigate event triggered with URL:', url)

    // Check if this is a file:// URL from a drag-drop
    if (url.startsWith('file://')) {
      event.preventDefault()
      console.log('[main] ✓ Prevented file navigation (file:// URL detected)')

      // Extract file path properly - on Unix/Mac, file:// URLs have three slashes
      // file:///Users/... -> /Users/...
      // file:///C:/Users/... -> C:/Users/... (Windows with file:///)
      // file://C:/Users/... -> C:/Users/... (Windows with file://)
      let filePath = url

      // Remove 'file://' prefix
      if (filePath.startsWith('file://')) {
        filePath = filePath.substring(7) // Remove 'file://'
      }

      // On Unix/Mac, file URLs start with file:/// so we have leading / left
      // On Windows, file URLs are file:///C:/ so we also have leading / that needs removal
      if (filePath.startsWith('/') && /^\/[A-Za-z]:/.test(filePath)) {
        // Windows path like /C:/Users -> C:/Users
        filePath = filePath.substring(1)
      }

      filePath = decodeURIComponent(filePath)

      console.log('[main] ✓ Extracted file path:', filePath)
      console.log('[main] ✓ Sending file-dropped-from-main IPC with paths:', [filePath])

      mainWindow?.webContents.send('file-dropped-from-main', [filePath])

      console.log('[main] ✓ IPC message sent successfully')
    } else {
      console.log('[main] ✗ Not a file:// URL, allowing navigation to proceed')
    }
  })

  // Set up protocol handling for file drops
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' }
  })
}

// Handle file opening from OS (macOS)
let fileToOpen: string | null = null

app.on('open-file', (event, filePath) => {
  event.preventDefault()

  if (mainWindow && mainWindow.webContents) {
    // Window is ready, send the file path
    mainWindow.webContents.send('open-file', filePath)
  } else {
    // Window not ready yet, store for later
    fileToOpen = filePath
  }
})

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  // Check if app was launched with a file path (Windows/Linux)
  if (process.platform !== 'darwin' && process.argv.length >= 2) {
    const filePath = process.argv[process.argv.length - 1]
    if (filePath && !filePath.startsWith('-') && filePath.endsWith('.vtt')) {
      fileToOpen = filePath
    }
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// File operations with proper permission handling

/**
 * Open file picker dialog and return file info
 */
ipcMain.handle('dialog:openFile', async (_event, options?: {
  filters?: Array<{ name: string; extensions: string[] }>,
  properties?: Array<'openFile' | 'multiSelections'>
}) => {
  if (!mainWindow) return null

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: options?.properties || ['openFile'],
    filters: options?.filters || [
      { name: 'VTT Files', extensions: ['vtt'] },
      { name: 'Media Files', extensions: ['mp4', 'webm', 'ogg', 'mp3', 'wav', 'mov', 'm4a'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths
})

/**
 * Read file contents - handles security-scoped bookmarks on macOS
 */
ipcMain.handle('file:read', async (_event, filePath: string) => {
  try {
    // On macOS, start accessing the security-scoped resource
    if (process.platform === 'darwin' && fileBookmarks.has(filePath)) {
      const bookmark = fileBookmarks.get(filePath)!
      // In a real implementation, you'd use app.startAccessingSecurityScopedResource
      // For now, we rely on the dialog.showOpenDialog providing temporary access
    }

    const content = await fs.readFile(filePath, 'utf-8')
    return { success: true, content, filePath }
  } catch (error) {
    console.error('Error reading file:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error reading file'
    }
  }
})

/**
 * Write file contents - prompts for save location
 */
ipcMain.handle('file:save', async (_event, options: {
  content: string,
  defaultPath?: string,
  suggestedName?: string
}) => {
  if (!mainWindow) return { success: false, error: 'No window available' }

  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: options.suggestedName || 'captions.vtt',
      filters: [
        { name: 'VTT Files', extensions: ['vtt'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (result.canceled || !result.filePath) {
      return { success: false, error: 'Save canceled' }
    }

    await fs.writeFile(result.filePath, options.content, 'utf-8')

    return { success: true, filePath: result.filePath }
  } catch (error) {
    console.error('Error saving file:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error saving file'
    }
  }
})

/**
 * Save to existing file (already has permission from previous open/save)
 */
ipcMain.handle('file:saveExisting', async (_event, options: {
  filePath: string,
  content: string
}) => {
  try {
    // On macOS, start accessing the security-scoped resource
    if (process.platform === 'darwin' && fileBookmarks.has(options.filePath)) {
      const bookmark = fileBookmarks.get(options.filePath)!
      // In a real implementation, you'd use app.startAccessingSecurityScopedResource
    }

    await fs.writeFile(options.filePath, options.content, 'utf-8')

    return { success: true, filePath: options.filePath }
  } catch (error) {
    console.error('Error saving file:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error saving file'
    }
  }
})

/**
 * Get file stats
 */
ipcMain.handle('file:stat', async (_event, filePath: string) => {
  try {
    const stats = await fs.stat(filePath)
    return {
      success: true,
      exists: true,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      size: stats.size,
      modified: stats.mtime.toISOString()
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { success: true, exists: false }
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error checking file'
    }
  }
})

/**
 * Convert file path to protocol URL for media loading
 */
ipcMain.handle('file:toURL', async (_event, filePath: string) => {
  try {
    // Ensure the file exists and we can access it
    await fs.access(filePath)

    // Return file:// URL
    const url = `file://${filePath}`
    return { success: true, url, filePath }
  } catch (error) {
    console.error('Error converting file to URL:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Cannot access file'
    }
  }
})

// Handle file drops from system
ipcMain.handle('file:processDroppedFiles', async (_event, filePaths: string[]) => {
  console.log('[main] ✓ processDroppedFiles IPC handler called')
  console.log('[main] ✓ Received file paths:', filePaths)
  console.log('[main] ✓ Number of files to process:', filePaths.length)

  const results = []

  for (const filePath of filePaths) {
    console.log('[main] Processing file:', filePath)
    try {
      const stats = await fs.stat(filePath)
      console.log('[main]   - File exists, is file:', stats.isFile())

      if (!stats.isFile()) {
        console.log('[main]   - Skipping (not a file)')
        continue
      }

      const ext = path.extname(filePath).toLowerCase()
      console.log('[main]   - File extension:', ext)

      if (ext === '.vtt') {
        console.log('[main]   - Reading VTT file content')
        const content = await fs.readFile(filePath, 'utf-8')
        console.log('[main]   - VTT content length:', content.length)
        results.push({
          type: 'vtt',
          filePath,
          fileName: path.basename(filePath),
          content
        })
        console.log('[main]   ✓ VTT file added to results')
      } else if (['.mp4', '.webm', '.ogg', '.mp3', '.wav', '.mov', '.m4a'].includes(ext)) {
        const url = `file://${filePath}`
        console.log('[main]   - Creating media URL:', url)
        results.push({
          type: 'media',
          filePath,
          fileName: path.basename(filePath),
          url
        })
        console.log('[main]   ✓ Media file added to results')
      } else {
        console.log('[main]   - Skipping (unsupported file type)')
      }
    } catch (error) {
      console.error('[main]   ✗ Error processing dropped file:', error)
    }
  }

  console.log('[main] ✓ Finished processing files, returning', results.length, 'results')
  console.log('[main] ✓ Results:', results)
  return results
})
