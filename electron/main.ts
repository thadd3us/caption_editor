import { app, BrowserWindow, ipcMain, dialog, Menu, protocol, net } from 'electron'
import * as path from 'path'
import * as fs from 'fs/promises'
import { existsSync, mkdirSync } from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as os from 'os'
import { APP_VERSION, UV_VERSION, ASR_COMMIT_HASH, ASR_GITHUB_REPO } from './constants'

const execAsync = promisify(exec)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const vtt_files = ['vtt']
const MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'video/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mov': 'video/quicktime',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac'
}
const media_files = Object.keys(MIME_TYPES).map(ext => ext.substring(1))
const all_files = vtt_files.concat(media_files)

// Register custom protocols as privileged for media streaming
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true, bypassCSP: false } }
])

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
        },
        {
          label: 'Compute Speaker Embeddings for Segments',
          enabled: false,  // Will be enabled when media and VTT are loaded
          id: 'asr-embed',
          click: () => {
            mainWindow?.webContents.send('menu-asr-embed')
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
    show: process.env.HEADLESS !== 'true',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,  // Disabled to allow file.path property in drag-and-drop
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  })

  // Set up Content Security Policy
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // unsafe-eval is needed for Vite in dev, unsafe-inline for some libraries
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "media-src 'self' media: blob:", // Allow our custom media protocol
      "connect-src 'self' ws: http: https:" // Allow dev server connections
    ].join('; ')

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    })
  })

  // In development, load from Vite dev server
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    // In production, load from built files
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  let isQuitting = false

  mainWindow.on('close', (e) => {
    // In test environment, allow direct closing to avoid hanging E2E tests.
    // In production/dev, we intercept to allow "unsaved changes" confirmation.
    if (!isQuitting && process.env.NODE_ENV !== 'test') {
      e.preventDefault()
      mainWindow?.webContents.send('app-close')
    }
  })

  // IPC handler to actually quit the app after confirmation
  ipcMain.on('app:quit', () => {
    isQuitting = true
    app.quit()
  })

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
  // Create a custom media protocol handler to securely serve local files.
  // Using a custom protocol is required once webSecurity is enabled.
  protocol.handle('media', async (request) => {
    try {
      const url = new URL(request.url)
      // Extract the path - it should be everything after 'media://local'
      let filePath = decodeURIComponent(url.pathname)

      // Normalize for pathToFileURL (remove leading slash if it's a Windows drive letter)
      if (process.platform === 'win32' && filePath.startsWith('/')) {
        filePath = filePath.substring(1)
      }

      // Detect MIME type based on extension
      const ext = path.extname(filePath).toLowerCase()
      const contentType = MIME_TYPES[ext] || 'application/octet-stream'

      // IMPORTANT: For large media files (movies, etc.), we MUST support streaming.
      // 1. We pass the original request headers (which may contain 'Range') to net.fetch.
      // 2. net.fetch returns a ReadableStream which is piped directly to the renderer.
      // 3. This ensures that only the requested bytes are read from disk, allowing
      //    the media player to seek and load metadata efficiently without fetching 
      //    the entire file into memory.
      console.log(`[main] media:// request: ${request.url}`, {
        method: request.method,
        range: request.headers.get('Range')
      })

      const response = await net.fetch(pathToFileURL(filePath).toString(), {
        bypassCustomProtocolHandlers: true,
        method: request.method,
        headers: request.headers
      })

      // Get file size to ensure Content-Length is present
      const stats = await fs.stat(filePath)
      const fileSize = stats.size

      // We must return a new Response to ensure headers like Content-Type 
      // are correctly set for the browser to detect duration/metadata.
      const headers = new Headers(response.headers)
      headers.set('Content-Type', contentType)
      headers.set('Accept-Ranges', 'bytes')

      // If it's not a partial response, ensure Content-Length is set correctly
      if (response.status !== 206 && !headers.has('Content-Length')) {
        headers.set('Content-Length', fileSize.toString())
      }

      console.log(`[main] media:// response: ${response.status}`, {
        contentType: headers.get('Content-Type'),
        contentLength: headers.get('Content-Length'),
        contentRange: headers.get('Content-Range'),
        acceptRanges: headers.get('Accept-Ranges')
      })

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      })
    } catch (error) {
      console.error('[main] media:// protocol error:', error)
      return new Response('Invalid media URL', { status: 400 })
    }
  })

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
      { name: 'All Supported Files', extensions: all_files },
      { name: 'VTT Files', extensions: vtt_files },
      { name: 'Media Files', extensions: media_files }
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
      const _bookmark = fileBookmarks.get(filePath)!
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
      const _bookmark = fileBookmarks.get(options.filePath)!
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

    // Return media:// URL instead of file://
    // Using media://local/path format for clean URL parsing
    const url = `media://local${filePath}`
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
ipcMain.on('menu:updateAsrEnabled', (_event, options: boolean | { caption?: boolean; embed?: boolean }) => {
  const menu = Menu.getApplicationMenu()
  if (menu) {
    if (typeof options === 'boolean') {
      const asrItem = menu.getMenuItemById('asr-caption')
      if (asrItem) {
        asrItem.enabled = options
      }
    } else {
      if (options.caption !== undefined) {
        const asrItem = menu.getMenuItemById('asr-caption')
        if (asrItem) asrItem.enabled = options.caption
      }
      if (options.embed !== undefined) {
        const embedItem = menu.getMenuItemById('asr-embed')
        if (embedItem) embedItem.enabled = options.embed
      }
    }
  }
})

/**
 * Ensures uv and uvx binaries are available in the ~/.cache/caption_editor/bin directory.
 * Downloads them from GitHub releases if missing.
 */
async function ensureUvBinaries(onLog?: (msg: string) => void): Promise<{ uv: string, uvx: string }> {
  const cacheDir = path.join(os.homedir(), '.cache', 'caption_editor')
  const binDir = path.join(cacheDir, 'bin')
  if (!existsSync(binDir)) {
    mkdirSync(binDir, { recursive: true })
  }

  const uvPath = path.join(binDir, 'uv')
  const uvxPath = path.join(binDir, 'uvx')

  if (existsSync(uvPath) && existsSync(uvxPath)) {
    return { uv: uvPath, uvx: uvxPath }
  }

  const log = (msg: string) => {
    console.log(`[main] ${msg}`)
    if (onLog) onLog(msg + '\n')
  }

  log(`UV binaries missing. Downloading version ${UV_VERSION}...`)

  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64'
  const platform = process.platform === 'darwin' ? 'apple-darwin' : 'unknown-linux-musl'
  const assetName = `uv-${arch}-${platform}.tar.gz`
  const downloadUrl = `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${assetName}`
  const tarPath = path.join(binDir, assetName)

  try {
    log(`Downloading from ${downloadUrl}...`)
    const response = await net.fetch(downloadUrl)
    if (!response.ok) throw new Error(`Failed to download uv: ${response.statusText}`)

    const buffer = await response.arrayBuffer()
    await fs.writeFile(tarPath, Buffer.from(buffer))

    log(`Extracting ${assetName}...`)
    const extractDir = path.join(binDir, 'extract')
    if (existsSync(extractDir)) await fs.rm(extractDir, { recursive: true, force: true })
    mkdirSync(extractDir)

    await execAsync(`tar -xzf "${tarPath}" -C "${extractDir}"`)

    const subfolder = assetName.replace('.tar.gz', '')
    const extractedUv = path.join(extractDir, subfolder, 'uv')
    const extractedUvx = path.join(extractDir, subfolder, 'uvx')

    if (!existsSync(extractedUv)) {
      throw new Error(`Could not find uv binary in extracted archive ${assetName}`)
    }

    await fs.rename(extractedUv, uvPath)
    await fs.rename(extractedUvx, uvxPath)

    await fs.rm(extractDir, { recursive: true, force: true })
    await fs.unlink(tarPath)

    await fs.chmod(uvPath, 0o755)
    await fs.chmod(uvxPath, 0o755)

    log(`UV binaries successfully installed to ${binDir}`)
    return { uv: uvPath, uvx: uvxPath }
  } catch (error) {
    log(`Failed to ensure UV binaries: ${error}`)
    throw error
  }
}

/**
 * Common helper to run ASR tools (transcribe, embed, etc.)
 */
interface AsrResult {
  success: boolean
  tool?: 'transcribe' | 'embed'
  processId?: string
  error?: string
  canceled?: boolean
}

interface ActiveProcess {
  cancel: () => void
}

async function runAsrTool(options: {
  script: 'transcribe_cli.py' | 'embed_cli.py',
  inputPath: string,
  model?: string,
  chunkSize?: number
}): Promise<AsrResult> {
  const { script, inputPath, model, chunkSize } = options

  // Store process for cancellation
  const processId = Date.now().toString()

  const sendOutput = (type: 'stdout' | 'stderr', data: string) => {
    mainWindow?.webContents.send('asr:output', { processId, type, data })
  }

  // Determine if we're in dev mode
  const runFromCodeTree = process.env.CAPTION_EDITOR_RUN_TRANSCRIBE_FROM_CODE_TREE === '1'
  const isDev = runFromCodeTree || process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL

  let pythonCommand: string
  let pythonArgs: string[]
  let cwd: string

  const scriptName = script
  const tool = script === 'transcribe_cli.py' ? 'transcribe' : 'embed'

  if (isDev) {
    const codeTreeRoot = process.env.CAPTION_EDITOR_RUN_TRANSCRIBE_FROM_CODE_TREE === '1'
      ? (process.env.CAPTION_EDITOR_CODE_TREE_ROOT || path.join(__dirname, '..'))
      : path.join(__dirname, '..')

    pythonCommand = 'uv'
    pythonArgs = ['run', 'python', scriptName, inputPath]
    cwd = path.join(codeTreeRoot, 'transcribe')

    if (tool === 'transcribe' && chunkSize !== undefined) {
      pythonArgs.push('--chunk-size', chunkSize.toString())
    }
    if (model) pythonArgs.push('--model', model)

    const scriptPath = path.join(cwd, scriptName)
    if (!existsSync(scriptPath)) {
      throw new Error(`${scriptName} not found at ${scriptPath}`)
    }
  } else {
    // Production mode: use downloaded uvx
    const { uvx } = await ensureUvBinaries((msg) => sendOutput('stdout', msg))
    pythonCommand = uvx

    const overridesPath = path.join(__dirname, '..', 'electron', 'overrides.txt')
    pythonArgs = [
      '--from', `${ASR_GITHUB_REPO}@${ASR_COMMIT_HASH}#subdirectory=transcribe`,
      '--overrides', overridesPath,
      tool,
      inputPath
    ]
    cwd = os.tmpdir()

    if (tool === 'transcribe' && chunkSize !== undefined) {
      pythonArgs.push('--chunk-size', chunkSize.toString())
    }
    if (model) pythonArgs.push('--model', model)

    if (!existsSync(pythonCommand)) throw new Error(`UV/UVX binary not found at ${pythonCommand}`)
    if (!existsSync(overridesPath)) throw new Error(`overrides.txt not found at ${overridesPath}`)
  }

  mainWindow?.webContents.send('asr:started', { processId })

  const { spawn } = await import('child_process')
  const binDir = path.join(os.homedir(), '.cache', 'caption_editor', 'bin')
  const env = { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH || ''}` }

  // Use a temporary directory for CWD to avoid issues with spaces in project paths 
  // (some tools like uvx might have issues with spaces in current directory)
  if (!cwd) {
    cwd = os.tmpdir()
  }

  let canceled = false

  return new Promise((resolve, reject) => {
    // Start process in its own process group so we can kill its children
    const proc = spawn(pythonCommand, pythonArgs, {
      cwd,
      env,
      detached: process.platform !== 'win32'
    })

    activeProcesses.set(processId, {
      proc,
      cancel: () => {
        canceled = true
        if (process.platform === 'win32') {
          proc.kill()
        } else {
          try {
            // Kill the entire process group
            process.kill(-proc.pid!, 'SIGTERM')
          } catch {
            // Fallback if PGID killing fails
            proc.kill('SIGTERM')
          }
        }
      }
    })

    proc.stdout?.on('data', (data) => sendOutput('stdout', data.toString()))
    proc.stderr?.on('data', (data) => sendOutput('stderr', data.toString()))

    proc.on('close', (code) => {
      activeProcesses.delete(processId)
      if (code === 0) {
        resolve({ success: true, tool, processId })
      } else if (canceled || code === 143) {
        console.log(`[main] ASR ${tool} process ${processId} canceled or terminated with code ${code}`)
        resolve({ success: false, error: 'Canceled', canceled: true })
      } else {
        const errorMsg = `Process exited with code ${code}`
        console.error(`[main] ASR ${tool} ${errorMsg}`)
        reject(new Error(errorMsg))
      }
    })

    proc.on('error', (err) => {
      activeProcesses.delete(processId)
      if (canceled) {
        resolve({ success: false, error: 'Canceled', canceled: true })
      } else {
        reject(err)
      }
    })
  })
}

/**
 * Run ASR transcription on media file
 */
ipcMain.handle('asr:transcribe', async (_event, options: {
  mediaFilePath: string,
  model?: string,
  chunkSize?: number
}) => {
  const result = await runAsrTool({
    script: 'transcribe_cli.py',
    inputPath: options.mediaFilePath,
    model: options.model,
    chunkSize: options.chunkSize
  })

  if (result.success) {
    const vttPath = options.mediaFilePath.replace(path.extname(options.mediaFilePath), '.vtt')
    try {
      const content = await fs.readFile(vttPath, 'utf-8')
      return {
        ...result,
        vttPath,
        content
      }
    } catch (err) {
      console.error('[main] Failed to read generated VTT file:', err)
      return {
        success: false,
        error: `Transcription succeeded but failed to read result file: ${err instanceof Error ? err.message : 'Unknown error'}`
      }
    }
  }

  return result
})

/**
 * Run speaker embedding on VTT file
 */
ipcMain.handle('asr:embed', async (_event, options: {
  vttPath: string,
  model?: string
}) => {
  const result = await runAsrTool({
    script: 'embed_cli.py',
    inputPath: options.vttPath,
    model: options.model
  })

  if (result.success) {
    try {
      const content = await fs.readFile(options.vttPath, 'utf-8')
      return {
        ...result,
        content
      }
    } catch (err) {
      console.error('[main] Failed to read VTT file after embedding:', err)
      return {
        success: false,
        error: `Embedding succeeded but failed to read result file: ${err instanceof Error ? err.message : 'Unknown error'}`
      }
    }
  }

  return result
})



/**
 * Cancel running ASR process
 */
ipcMain.handle('asr:cancel', async (_event, processId: string) => {
  const item = activeProcesses.get(processId)
  if (item) {
    console.log(`[main] Cancelling ASR process ${processId}`)
    item.cancel()
    activeProcesses.delete(processId)
    return { success: true }
  }
  return { success: false, error: 'Process not found' }
})

// Store active ASR processes
const activeProcesses = new Map<string, ActiveProcess>()

// Handle file drops from system
ipcMain.handle('file:processDroppedFiles', async (_event, filePaths: string[]) => {
  console.log('[main] processDroppedFiles called for', filePaths.length, 'files')

  const results = []

  for (const filePath of filePaths) {
    try {
      const stats = await fs.stat(filePath)
      if (!stats.isFile()) continue

      const ext = path.extname(filePath).toLowerCase()
      const extensionWithoutDot = ext.substring(1)

      if (vtt_files.includes(extensionWithoutDot)) {
        const content = await fs.readFile(filePath, 'utf-8')
        results.push({
          type: 'vtt',
          filePath,
          fileName: path.basename(filePath),
          content
        })
        console.log(`[main] Loaded VTT: ${filePath}`)
      } else if (media_files.includes(extensionWithoutDot)) {
        const url = `media://local${filePath}`
        results.push({
          type: 'media',
          filePath,
          fileName: path.basename(filePath),
          url
        })
        console.log(`[main] Created media URL for: ${filePath}`)
      } else {
        console.log(`[main] Skipping unsupported file type: ${ext}`)
      }
    } catch (error) {
      console.error(`[main] Error processing file ${filePath}:`, error)
    }
  }

  return results
})
