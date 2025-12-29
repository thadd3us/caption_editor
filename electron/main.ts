import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import * as path from 'path'
import * as fs from 'fs/promises'
import { existsSync, readFileSync } from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Read version from VERSION file (single source of truth).
// NOTE: We package `VERSION` into `app.asar` so this path works in production.
const versionFilePath = path.join(__dirname, '../VERSION')
let APP_VERSION: string
try {
  APP_VERSION = readFileSync(versionFilePath, 'utf-8').trim()
} catch (err) {
  // No fallback: fail fast with a clear message if packaging is misconfigured.
  throw new Error(
    `VERSION not found at ${versionFilePath}. ` +
      `Ensure electron-builder packages VERSION into app.asar.\n\n` +
      `Original error: ${err instanceof Error ? err.message : String(err)}`
  )
}

// Log version on startup
console.log(`[main] ========================================`)
console.log(`[main] VTT Caption Editor v${APP_VERSION}`)
console.log(`[main] Electron v${process.versions.electron}`)
console.log(`[main] Chrome v${process.versions.chrome}`)
console.log(`[main] Node v${process.versions.node}`)
console.log(`[main] Platform: ${process.platform}`)
console.log(`[main] ========================================`)

// Store security-scoped bookmarks for macOS
const fileBookmarks = new Map<string, Buffer>()

let mainWindow: BrowserWindow | null = null

function createMenu() {
  const isMac = process.platform === 'darwin'

  const template: Electron.MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const }
      ]
    }] : []),

    // File menu
    {
      label: 'File',
      submenu: [
        {
          label: 'Open File...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            mainWindow?.webContents.send('menu-open-file')
          }
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            mainWindow?.webContents.send('menu-save-file')
          }
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            mainWindow?.webContents.send('menu-save-as')
          }
        },
        { type: 'separator' as const },
        isMac ? { role: 'close' as const } : { role: 'quit' as const }
      ]
    },

    // Edit menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        ...(isMac ? [
          { role: 'pasteAndMatchStyle' as const },
          { role: 'delete' as const },
          { role: 'selectAll' as const },
          { type: 'separator' as const },
          {
            label: 'Speech',
            submenu: [
              { role: 'startSpeaking' as const },
              { role: 'stopSpeaking' as const }
            ]
          }
        ] : [
          { role: 'delete' as const },
          { type: 'separator' as const },
          { role: 'selectAll' as const }
        ])
      ]
    },

    // Speaker menu
    {
      label: 'Speaker',
      submenu: [
        {
          label: 'Rename Speaker...',
          click: () => {
            mainWindow?.webContents.send('menu-rename-speaker')
          }
        },
        {
          label: 'Sort Rows by Speaker Similarity',
          click: () => {
            mainWindow?.webContents.send('menu-compute-speaker-similarity')
          }
        }
      ]
    },

    // AI Annotations menu
    {
      label: 'AI Annotations',
      submenu: [
        {
          label: 'Caption with Speech Recognizer',
          enabled: false,  // Will be enabled when media is loaded
          id: 'asr-caption',
          click: () => {
            mainWindow?.webContents.send('menu-asr-caption')
          }
        }
      ]
    },

    // View menu
    {
      label: 'View',
      submenu: [
        { role: 'reload' as const },
        { role: 'forceReload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' as const },
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const }
      ]
    },

    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const },
          { type: 'separator' as const },
          { role: 'window' as const }
        ] : [
          { role: 'close' as const }
        ])
      ]
    },

    // Help menu
    {
      role: 'help',
      submenu: [
        {
          label: `VTT Caption Editor v${APP_VERSION}`,
          enabled: false
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,  // Disabled to allow file.path property in drag-and-drop
      webSecurity: false  // Disable web security to allow file.path access
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
  createMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  // Check if app was launched with a file path (Windows/Linux/macOS)
  // On macOS, this handles test scenarios where files are passed as arguments
  // In production, macOS uses the 'open-file' event instead
  if (process.argv.length >= 2) {
    const filePath = process.argv[process.argv.length - 1]
    if (filePath && !filePath.startsWith('-') && filePath.endsWith('.vtt')) {
      fileToOpen = filePath
    }
  }

  // Handle files dropped from preload
  ipcMain.on('files-dropped', (_event, filePaths: string[]) => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('files-dropped', filePaths)
    }
  })
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
      { name: 'All Files', extensions: ['*'] },
      { name: 'VTT Files', extensions: ['vtt'] },
      { name: 'Media Files', extensions: ['mp4', 'webm', 'ogg', 'mp3', 'wav', 'mov', 'm4a'] }
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

/**
 * Update menu item enabled state
 */
ipcMain.on('menu:updateAsrEnabled', (_event, enabled: boolean) => {
  const menu = Menu.getApplicationMenu()
  if (menu) {
    const asrItem = menu.getMenuItemById('asr-caption')
    if (asrItem) {
      asrItem.enabled = enabled
    }
  }
})

/**
 * Run ASR transcription on media file
 */
ipcMain.handle('asr:transcribe', async (_event, options: {
  mediaFilePath: string,
  model?: string,  // Optional model override (default: nvidia/parakeet-tdt-0.6b-v3)
  chunkSize?: number  // Optional chunk size in seconds (default: 180)
}) => {
  const { mediaFilePath, model, chunkSize } = options

  // Determine if we're in dev mode
  // Use explicit env var first, then fallback to NODE_ENV/VITE_DEV_SERVER_URL
  const runFromCodeTree = process.env.CAPTION_EDITOR_RUN_TRANSCRIBE_FROM_CODE_TREE === '1'
  const isDev = runFromCodeTree || process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL

  let pythonCommand: string
  let pythonArgs: string[]
  let cwd: string

  if (isDev) {
    // Dev mode: use uv run python
    // Use CAPTION_EDITOR_CODE_TREE_ROOT if set, otherwise compute from __dirname
    const codeTreeRoot = process.env.CAPTION_EDITOR_CODE_TREE_ROOT || path.join(__dirname, '..')
    pythonCommand = 'uv'
    pythonArgs = ['run', 'python', 'transcribe.py', mediaFilePath]
    cwd = path.join(codeTreeRoot, 'transcribe')

    // Add chunk size if specified
    if (chunkSize !== undefined) {
      pythonArgs.push('--chunk-size', chunkSize.toString())
    }

    // Add model flag if specified
    if (model) {
      pythonArgs.push('--model', model)
    }

    // Validate that transcribe.py exists
    const scriptPath = path.join(cwd, 'transcribe.py')
    if (!existsSync(scriptPath)) {
      throw new Error(`transcribe.py not found at ${scriptPath}. Code tree root: ${codeTreeRoot}`)
    }
  } else {
    // Production mode: use bundled uvx to run from GitHub repository
    // GitHub repository and commit hash (can be updated for new releases)
    const gitRepo = 'git+https://github.com/thadd3us/caption_editor'
    const commitHash = 'f8bcf53'  // Update this to the commit hash you want to use

    // Determine platform-specific uvx binary name
    const platform = process.platform === 'darwin' ? 'macos' : 'linux'
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
    const uvxBinaryName = `uvx-${platform}-${arch}`

    // Use uvx binary from electron/bin/ (works in both dev and packaged mode)
    // In dev: __dirname is dist-electron/, so ../electron/bin/
    // In packaged: electron/bin/ is copied alongside dist-electron/ in app.asar
    pythonCommand = path.join(__dirname, '..', 'electron', 'bin', uvxBinaryName)
    pythonArgs = [
      '--from', `${gitRepo}@${commitHash}#subdirectory=transcribe`,
      '--overrides', path.join(process.resourcesPath, 'overrides.txt'),
      'transcribe',
      mediaFilePath
    ]
    cwd = process.cwd()  // Can run from any directory with uvx

    // Add chunk size if specified
    if (chunkSize !== undefined) {
      pythonArgs.push('--chunk-size', chunkSize.toString())
    }

    // Add model flag if specified
    if (model) {
      pythonArgs.push('--model', model)
    }

    // Validate that bundled uvx exists
    if (!existsSync(pythonCommand)) {
      throw new Error(
        `Bundled uvx not found at ${pythonCommand}. ` +
        `Platform: ${platform}, Arch: ${arch}. ` +
        `Ensure the app is properly packaged with uvx binary.`
      )
    }

    // Validate that overrides.txt exists
    const overridesPath = path.join(process.resourcesPath, 'overrides.txt')
    if (!existsSync(overridesPath)) {
      throw new Error(
        `overrides.txt not found at ${overridesPath}. ` +
        `Ensure the app is properly packaged with the overrides file.`
      )
    }
  }

  console.log('[main] Starting ASR transcription:', { pythonCommand, pythonArgs, cwd, isDev, runFromCodeTree })

  // Import spawn here to use in subprocess
  const { spawn } = await import('child_process')

  return new Promise((resolve, reject) => {
    const proc = spawn(pythonCommand, pythonArgs, { cwd })
    let stdout = ''
    let stderr = ''

    // Store process for cancellation
    const processId = Date.now().toString()
    activeProcesses.set(processId, proc)

    proc.stdout?.on('data', (data) => {
      const chunk = data.toString()
      stdout += chunk
      // Send output to renderer in real-time
      mainWindow?.webContents.send('asr:output', { processId, type: 'stdout', data: chunk })
    })

    proc.stderr?.on('data', (data) => {
      const chunk = data.toString()
      stderr += chunk
      // Send output to renderer in real-time
      mainWindow?.webContents.send('asr:output', { processId, type: 'stderr', data: chunk })
    })

    proc.on('close', (code) => {
      activeProcesses.delete(processId)

      if (code === 0) {
        // Success - output VTT file should be alongside media file
        const vttPath = mediaFilePath.replace(/\.[^.]+$/, '.vtt')
        resolve({ success: true, vttPath, processId })
      } else {
        reject(new Error(`ASR process exited with code ${code}\n\nstderr:\n${stderr}`))
      }
    })

    proc.on('error', (error) => {
      activeProcesses.delete(processId)
      reject(error)
    })

    // Send initial process ID to renderer
    mainWindow?.webContents.send('asr:started', { processId })
  })
})

/**
 * Cancel running ASR process
 */
ipcMain.handle('asr:cancel', async (_event, processId: string) => {
  const proc = activeProcesses.get(processId)
  if (proc) {
    proc.kill('SIGTERM')
    activeProcesses.delete(processId)
    return { success: true }
  }
  return { success: false, error: 'Process not found' }
})

// Store active ASR processes
const activeProcesses = new Map<string, any>()

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
