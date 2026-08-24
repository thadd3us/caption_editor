import { app, BrowserWindow, ipcMain, dialog, Menu, protocol, net, shell, nativeTheme } from 'electron'
import * as path from 'path'
import * as fs from 'fs/promises'
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, realpathSync } from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'
import { type ChildProcess } from 'child_process'
import * as os from 'os'
import { APP_VERSION } from './constants'
import { findBackupPath } from '../src/utils/fileUtils'
import { DEFAULT_PREFERENCES, sanitizePreferences, type AppPreferences } from '../src/types/preferences'


const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const CAPTIONS_JSON_SUFFIX = '.captions_json5'
const captions_json5_files = ['captions_json5', 'captions_json']
const srt_files = ['srt']
const MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogg': 'video/ogg',
  '.mp3': 'audio/mpeg',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.mov': 'video/quicktime',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac'
}
const media_files = Object.keys(MIME_TYPES).map(ext => ext.substring(1))
const all_files = captions_json5_files.concat(srt_files, media_files)

/** If `filePath` is a known media type and a sibling `<stem>.captions_json5` exists, open that instead. */
function resolveOpenFilePathPreferSiblingCaptions(filePath: string): string {
  const resolved = path.resolve(filePath)
  const ext = path.extname(resolved).toLowerCase()
  if (!(ext in MIME_TYPES)) return resolved
  const sibling = path.join(path.dirname(resolved), `${path.basename(resolved, path.extname(resolved))}${CAPTIONS_JSON_SUFFIX}`)
  return existsSync(sibling) ? sibling : resolved
}

// Register custom protocols as privileged for media streaming
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true, bypassCSP: false } }
])

// Log version on startup
console.log(`[main] ========================================`)
console.log(`[main] Caption Editor v${APP_VERSION}`)
console.log(`[main] Electron v${process.versions.electron}`)
console.log(`[main] Chrome v${process.versions.chrome}`)
console.log(`[main] Node v${process.versions.node}`)
console.log(`[main] Platform: ${process.platform}`)
console.log(`[main] ========================================`)

// Store security-scoped bookmarks for macOS
const fileBookmarks = new Map<string, Buffer>()

/** Helper: get the BrowserWindow that sent an IPC event, or the focused window as fallback. */
function windowForEvent(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()
}

/** Helper: get the focused window (for menu clicks which have no event). */
function focusedWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null
}

function createMenu() {
  const isMac = process.platform === 'darwin'

  const template: Electron.MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        {
          label: 'Settings...',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            focusedWindow()?.webContents.send('menu-open-preferences')
          }
        },
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
          label: 'New Window',
          accelerator: 'CmdOrCtrl+N',
          click: () => { createWindow() }
        },
        { type: 'separator' as const },
        {
          label: 'Open File...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            focusedWindow()?.webContents.send('menu-open-file')
          }
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            focusedWindow()?.webContents.send('menu-save-file')
          }
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            focusedWindow()?.webContents.send('menu-save-as')
          }
        },
        {
          label: 'Export',
          submenu: [
            {
              label: 'SRT...',
              click: () => {
                focusedWindow()?.webContents.send('menu-export-srt')
              }
            }
          ]
        },
        { type: 'separator' as const },
        // macOS convention puts Settings in the app menu; every other platform expects it here.
        ...(isMac ? [] : [
          {
            label: 'Preferences...',
            accelerator: 'CmdOrCtrl+,',
            click: () => {
              focusedWindow()?.webContents.send('menu-open-preferences')
            }
          },
          { type: 'separator' as const }
        ]),
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
            focusedWindow()?.webContents.send('menu-rename-speaker')
          }
        },
        {
          label: 'Sort Rows by Speaker Similarity',
          click: () => {
            focusedWindow()?.webContents.send('menu-compute-speaker-similarity')
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
            focusedWindow()?.webContents.send('menu-asr-caption')
          }
        },
        {
          label: 'Compute Speaker Embeddings for Segments',
          enabled: false,  // Will be enabled when media is loaded and segments exist
          id: 'asr-embed',
          click: () => {
            focusedWindow()?.webContents.send('menu-asr-embed')
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
          label: `Caption Editor v${APP_VERSION}`,
          enabled: false
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: process.env.HEADLESS !== 'true',
    // Prevent a bright flash when launching in dark mode.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f1115' : '#ffffff',
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
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
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
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    // In production, load from built files
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  win.on('close', (e) => {
    // Let the close through once the renderer has answered (or the app is quitting).
    if (forceQuit || closeApproved.has(win.id)) return

    // E2E teardown calls app.quit() and expects windows to go away, so the
    // interception is off under NODE_ENV=test unless a test opts in. Specs that
    // exercise the confirmation itself set CAPTION_EDITOR_INTERCEPT_CLOSE=1.
    if (process.env.NODE_ENV === 'test' && process.env.CAPTION_EDITOR_INTERCEPT_CLOSE !== '1') return

    e.preventDefault()
    win.webContents.send('app-close')
  })

  win.on('closed', () => {
    closeApproved.delete(win.id)
    releaseDocumentForWindow(win.id)
  })

  // Send any pending file to open once the window is ready
  win.webContents.on('did-finish-load', () => {
    if (fileToOpen) {
      win.webContents.send('open-file', fileToOpen)
      fileToOpen = null
    }
  })

  return win
}

// ---------------------------------------------------------------------------
// Quit / close coordination
//
// Each window owns a document and answers for itself. A quit therefore has to ask
// every window in turn and let any one of them veto the whole thing — the previous
// version asked them all at once, so the first window to answer closed itself and a
// later "Keep working" could not bring the others back.
// ---------------------------------------------------------------------------

/** Set once every window has approved; lets `close` handlers pass through. */
let forceQuit = false
/** Windows whose renderer has approved closing this one window. */
const closeApproved = new Set<number>()
/** Windows still to be asked during an in-progress quit. */
let quitQueue: number[] = []
let quitInProgress = false

function startQuitSequence() {
  quitInProgress = true
  quitQueue = BrowserWindow.getAllWindows().map((w) => w.id)
  askNextWindowToQuit()
}

function askNextWindowToQuit() {
  while (quitQueue.length > 0) {
    const id = quitQueue.shift()!
    const win = BrowserWindow.getAllWindows().find((w) => w.id === id)
    if (!win || win.isDestroyed()) continue
    // Focus so the dialog appears on the window it is asking about.
    win.focus()
    win.webContents.send('app-close')
    return
  }
  finishQuit()
}

function finishQuit() {
  quitInProgress = false
  quitQueue = []
  forceQuit = true
  app.quit()
}

function abortQuit() {
  console.log('[main] Quit canceled by a window')
  quitInProgress = false
  quitQueue = []
}

app.on('before-quit', (e) => {
  if (forceQuit) return
  if (process.env.NODE_ENV === 'test' && process.env.CAPTION_EDITOR_INTERCEPT_CLOSE !== '1') return
  e.preventDefault()
  if (quitInProgress) return
  startQuitSequence()
})

// A window's renderer approved closing (either "Save" or "Discard").
ipcMain.on('app:quit', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return

  if (quitInProgress) {
    // Part of a quit sequence: don't close windows one at a time, or a later veto
    // would leave the earlier ones already gone. Move on and close them together.
    askNextWindowToQuit()
    return
  }

  closeApproved.add(win.id)
  win.close()
})

// A window's renderer chose "Keep working" — abort the entire quit.
ipcMain.on('app:cancel-quit', () => {
  if (quitInProgress) abortQuit()
})

// ---------------------------------------------------------------------------
// Open-document registry
//
// Several windows may be open at once, and several may play the same media file —
// media is served read-only over the media:// protocol, so that is harmless. Editing
// the same .captions_json5 in two windows is not: both hold an independent in-memory
// document and whichever saves last silently wins. One window owns a given transcript
// at a time; anything else that tries to open it gets that window focused instead.
// ---------------------------------------------------------------------------

/** Canonical path → owning window id. */
const documentOwners = new Map<string, number>()

/**
 * Canonical key for a transcript path: resolves symlinks and, on case-insensitive
 * filesystems (macOS, Windows), folds case so `/A/Doc` and `/a/doc` are one document.
 */
function documentKey(filePath: string): string {
  let resolved = path.resolve(filePath)
  try {
    resolved = realpathSync(resolved)
  } catch {
    // File may not exist yet (Save As); the resolved path is still a usable key.
  }
  return process.platform === 'linux' ? resolved : resolved.toLowerCase()
}

function releaseDocumentForWindow(windowId: number): void {
  for (const [key, owner] of documentOwners) {
    if (owner === windowId) documentOwners.delete(key)
  }
}

/**
 * Claim a transcript for the requesting window.
 * Returns `{ claimed: false }` when another live window already owns it, in which
 * case that window has been focused.
 */
ipcMain.handle('doc:claim', (event, filePath: string) => {
  const win = windowForEvent(event)
  if (!win || !filePath) return { claimed: true }

  const key = documentKey(filePath)
  const ownerId = documentOwners.get(key)

  if (ownerId != null && ownerId !== win.id) {
    const owner = BrowserWindow.getAllWindows().find((w) => w.id === ownerId)
    if (owner && !owner.isDestroyed()) {
      if (owner.isMinimized()) owner.restore()
      owner.focus()
      return { claimed: false, focusedExistingWindow: true }
    }
    // Owner is gone without a 'closed' event (shouldn't happen) — take over.
    documentOwners.delete(key)
  }

  // A window owns at most one transcript at a time.
  releaseDocumentForWindow(win.id)
  documentOwners.set(key, win.id)
  return { claimed: true }
})

ipcMain.on('doc:release', (event) => {
  const win = windowForEvent(event)
  if (win) releaseDocumentForWindow(win.id)
})

/**
 * Reflect the open document in the window chrome: title, macOS proxy icon, and the
 * "edited" dot in the close button.
 */
ipcMain.on('window:setDocumentState', (event, state: {
  filePath?: string | null
  title?: string | null
  edited?: boolean
}) => {
  const win = windowForEvent(event)
  if (!win || win.isDestroyed()) return

  const name = state.title || (state.filePath ? path.basename(state.filePath) : null)
  win.setTitle(name ? `${name} — Caption Editor` : 'Caption Editor')
  if (process.platform === 'darwin') {
    win.setRepresentedFilename(state.filePath || '')
    win.setDocumentEdited(!!state.edited)
  }
})

/** License acceptance: localStorage is unreliable for packaged `file://` loads; persist under userData. */
const LICENSE_ACCEPTED_FILENAME = 'license-accepted.json'

function licenseAcceptedFilePath(): string {
  return path.join(app.getPath('userData'), LICENSE_ACCEPTED_FILENAME)
}

function readLicenseAcceptedFromDisk(): boolean {
  try {
    const p = licenseAcceptedFilePath()
    if (!existsSync(p)) return false
    const data = JSON.parse(readFileSync(p, 'utf8')) as { accepted?: unknown }
    return data.accepted === true
  } catch {
    return false
  }
}

ipcMain.on('license:getAcceptedSync', (event) => {
  event.returnValue = readLicenseAcceptedFromDisk()
})

ipcMain.handle('license:setAccepted', async () => {
  const p = licenseAcceptedFilePath()
  mkdirSync(path.dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify({ accepted: true, version: 1 }), 'utf8')
})

/** App preferences: same userData-file rationale as license acceptance above. */
const PREFERENCES_FILENAME = 'preferences.json'

function preferencesFilePath(): string {
  return path.join(app.getPath('userData'), PREFERENCES_FILENAME)
}

function readPreferencesFromDisk(): AppPreferences {
  try {
    const p = preferencesFilePath()
    if (!existsSync(p)) return { ...DEFAULT_PREFERENCES }
    return sanitizePreferences(JSON.parse(readFileSync(p, 'utf8')))
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

// Sync so the renderer can seed its store during setup without a first-paint flicker.
ipcMain.on('preferences:getSync', (event) => {
  event.returnValue = readPreferencesFromDisk()
})

ipcMain.handle('preferences:set', async (event, raw: unknown) => {
  const preferences = sanitizePreferences(raw)
  const p = preferencesFilePath()
  mkdirSync(path.dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify({ version: 1, ...preferences }, null, 2), 'utf8')
  // Preferences are app-wide: tell every *other* window so open windows stay in sync.
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.webContents !== event.sender) {
      win.webContents.send('preferences-changed', preferences)
    }
  }
  return preferences
})

if (process.env.NODE_ENV === 'test') {
  ipcMain.handle('license:clearAcceptedForTests', async () => {
    try {
      unlinkSync(licenseAcceptedFilePath())
    } catch {
      // no file
    }
  })
}

// Handle file opening from OS (macOS)
let fileToOpen: string | null = null

app.on('open-file', (event, filePath) => {
  event.preventDefault()

  const toOpen = resolveOpenFilePathPreferSiblingCaptions(filePath)
  const windows = BrowserWindow.getAllWindows()
  if (windows.length > 0) {
    const win = BrowserWindow.getFocusedWindow() || windows[0]
    win.webContents.send('open-file', toOpen)
  } else {
    // Window not ready yet, store for later
    fileToOpen = toOpen
  }
})

app.whenReady().then(() => {
  // Ensure we follow the OS appearance setting (macOS light/dark).
  nativeTheme.themeSource = 'system'

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

      const stats = await fs.stat(filePath)
      const fileSize = stats.size

      // Parse Range header for byte-range serving.
      // We handle ranges manually instead of relying on net.fetch because
      // Electron's net.fetch on file:// URLs throws ERR_REQUEST_RANGE_NOT_SATISFIABLE
      // for requests near EOF, causing Chromium to retry in an infinite loop.
      const rangeHeader = request.headers.get('Range')

      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d+)-(\d*)/)
        if (match) {
          const start = parseInt(match[1], 10)
          const end = match[2] ? parseInt(match[2], 10) : fileSize - 1

          // Validate range
          if (start >= fileSize) {
            const headers = new Headers()
            headers.set('Content-Range', `bytes */${fileSize}`)
            headers.set('Accept-Ranges', 'bytes')
            return new Response(null, { status: 416, statusText: 'Range Not Satisfiable', headers })
          }

          const clampedEnd = Math.min(end, fileSize - 1)
          const contentLength = clampedEnd - start + 1

          const { createReadStream } = await import('fs')
          const stream = createReadStream(filePath, { start, end: clampedEnd })
          const readable = new ReadableStream({
            start(controller) {
              stream.on('data', (chunk: Buffer) => controller.enqueue(chunk))
              stream.on('end', () => controller.close())
              stream.on('error', (err) => controller.error(err))
            },
            cancel() { stream.destroy() }
          })

          const headers = new Headers()
          headers.set('Content-Type', contentType)
          headers.set('Content-Length', contentLength.toString())
          headers.set('Content-Range', `bytes ${start}-${clampedEnd}/${fileSize}`)
          headers.set('Accept-Ranges', 'bytes')

          return new Response(readable, { status: 206, statusText: 'Partial Content', headers })
        }
      }

      // Non-range request: serve the full file
      const response = await net.fetch(pathToFileURL(filePath).toString(), {
        bypassCustomProtocolHandlers: true,
        method: request.method,
      })

      const headers = new Headers(response.headers)
      headers.set('Content-Type', contentType)
      headers.set('Accept-Ranges', 'bytes')
      if (!headers.has('Content-Length')) {
        headers.set('Content-Length', fileSize.toString())
      }

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
    const lower = (filePath || '').toLowerCase()
    const ext = path.extname(lower)
    if (filePath && !filePath.startsWith('-') && (lower.endsWith(CAPTIONS_JSON_SUFFIX) || lower.endsWith('.captions_json') || lower.endsWith('.srt') || ext in MIME_TYPES)) {
      fileToOpen = resolveOpenFilePathPreferSiblingCaptions(filePath)
    }
  }

  // Handle files dropped from preload — relay back to the sender window
  ipcMain.on('files-dropped', (event, filePaths: string[]) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      win.webContents.send('files-dropped', filePaths)
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
ipcMain.handle('dialog:openFile', async (event, options?: {
  filters?: Array<{ name: string; extensions: string[] }>,
  properties?: Array<'openFile' | 'multiSelections'>
}) => {
  const win = windowForEvent(event)
  if (!win) return null

  const result = await dialog.showOpenDialog(win, {
    properties: options?.properties || ['openFile'],
    filters: options?.filters || [
      { name: 'All Supported Files', extensions: all_files },
      { name: 'Captions Files (*.captions_json5)', extensions: captions_json5_files },
      { name: 'SRT Files', extensions: srt_files },
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
ipcMain.handle('file:save', async (event, options: {
  content: string,
  defaultPath?: string,
  suggestedName?: string
}) => {
  const win = windowForEvent(event)
  if (!win) return { success: false, error: 'No window available' }

  try {
    const result = await dialog.showSaveDialog(win, {
      defaultPath: options.suggestedName || `captions${CAPTIONS_JSON_SUFFIX}`,
      filters: [
        { name: 'Captions Files (*.captions_json5)', extensions: captions_json5_files },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (result.canceled || !result.filePath) {
      return { success: false, error: 'Save canceled' }
    }

    let targetPath = result.filePath
    if (!targetPath.toLowerCase().endsWith(CAPTIONS_JSON_SUFFIX)) {
      targetPath = targetPath + CAPTIONS_JSON_SUFFIX
    }

    await fs.writeFile(targetPath, options.content, 'utf-8')

    return { success: true, filePath: targetPath }
  } catch (error) {
    console.error('Error saving file:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error saving file'
    }
  }
})

/**
 * Write SRT file contents - prompts for save location
 */
ipcMain.handle('file:saveSrt', async (event, options: {
  content: string,
  suggestedName?: string
}) => {
  const win = windowForEvent(event)
  if (!win) return { success: false, error: 'No window available' }

  try {
    const result = await dialog.showSaveDialog(win, {
      defaultPath: options.suggestedName || 'captions.srt',
      filters: [
        { name: 'SRT Files', extensions: srt_files },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (result.canceled || !result.filePath) {
      return { success: false, error: 'Save canceled' }
    }

    let targetPath = result.filePath
    if (!targetPath.toLowerCase().endsWith('.srt')) {
      targetPath = targetPath + '.srt'
    }

    await fs.writeFile(targetPath, options.content, 'utf-8')

    return { success: true, filePath: targetPath }
  } catch (error) {
    console.error('Error saving SRT file:', error)
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
 * Show file in Finder/Explorer
 */
ipcMain.handle('file:showInFolder', async (_event, filePath: string) => {
  try {
    shell.showItemInFolder(filePath)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
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
 * Locate the //transcribe_rs/ Rust ASR binaries. Tries, in order:
 *
 *   1. Env-var override (CAPTION_EDITOR_TRANSCRIBE_RS_BIN /
 *      CAPTION_EDITOR_EMBED_RS_BIN). For local A/B testing of an
 *      uncommitted build — when one or both are set, they win.
 *   2. Inside-app bundle at `Contents/Resources/bin/`
 *      (production .app — populated by electron-builder's
 *      `extraResources` and signed alongside the main bundle).
 *   3. Dev fallback at `<repo>/dist-rust/` (populated by
 *      `npm run build:rust`, which is what `package:mac` runs
 *      before electron-builder — so the same files exist in both
 *      dev and prod, just under different paths).
 *
 * Throws with a clear message if none of those hit. Each callsite
 * resolves once per runAsrTool invocation; the cost is two
 * `existsSync` calls so we don't bother caching.
 */
function resolveRustAsrPaths(): { transcribeRs: string; embedRs: string } {
  const envTr = process.env.CAPTION_EDITOR_TRANSCRIBE_RS_BIN
  const envEmb = process.env.CAPTION_EDITOR_EMBED_RS_BIN

  const candidates = [
    // (label, transcribeRs path, embedRs path)
    ['bundled (Contents/Resources/bin)', path.join(process.resourcesPath, 'bin', 'transcribe-rs'), path.join(process.resourcesPath, 'bin', 'embed-rs')],
    // __dirname under a packaged app is inside the .app; under dev
    // it's `<repo>/dist-electron/`, so `../dist-rust/` lands in the
    // repo's staging dir.
    ['dev fallback (<repo>/dist-rust)', path.join(__dirname, '..', 'dist-rust', 'transcribe-rs'), path.join(__dirname, '..', 'dist-rust', 'embed-rs')],
  ] as const

  // Env-var override wins outright if set — it may point at a
  // bazel-bin path, a custom build, or a downloaded artifact.
  if (envTr && envEmb) {
    if (!existsSync(envTr)) throw new Error(`CAPTION_EDITOR_TRANSCRIBE_RS_BIN=${envTr} does not exist`)
    if (!existsSync(envEmb)) throw new Error(`CAPTION_EDITOR_EMBED_RS_BIN=${envEmb} does not exist`)
    return { transcribeRs: envTr, embedRs: envEmb }
  }
  // Partial override — only one set: fill the other from the first
  // hit in the fallback list.
  for (const [, tr, emb] of candidates) {
    const resolvedTr = envTr ?? (existsSync(tr) ? tr : null)
    const resolvedEmb = envEmb ?? (existsSync(emb) ? emb : null)
    if (resolvedTr && resolvedEmb) {
      return { transcribeRs: resolvedTr, embedRs: resolvedEmb }
    }
  }

  throw new Error(
    `Could not locate the Rust ASR binaries. Tried:\n` +
    candidates.map(([label, tr]) => `  - ${label}: ${tr}`).join('\n') +
    `\nBuild them with \`npm run build:rust\` (or \`bazelisk build //transcribe_rs/transcribe-rs //transcribe_rs/embed-rs\`).`,
  )
}

/**
 * Bundled ffmpeg only — never the user's PATH. Must sit next to the Rust
 * binaries (dist-rust/ or Contents/Resources/bin/) or be set explicitly.
 */
function resolveBundledFfmpeg(rustBinaryPath: string): string {
  const candidates = [
    process.env.CAPTION_EDITOR_FFMPEG,
    path.join(path.dirname(rustBinaryPath), 'ffmpeg'),
    path.join(process.resourcesPath, 'bin', 'ffmpeg'),
  ].filter((p): p is string => !!p)

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error(
    `Bundled ffmpeg not found. Expected one of:\n` +
    candidates.map((p) => `  - ${p}`).join('\n') +
    `\nRun \`npm run build:rust\` (includes build:ffmpeg) before transcribing.`,
  )
}

/**
 * Common helper to run ASR tools (transcribe, embed, etc.)
 */
interface AsrResult {
  success: boolean
  script?: string
  processId?: string
  error?: string
  canceled?: boolean
}

interface ActiveProcess {
  proc: ChildProcess
  cancel: () => void
}

async function runAsrTool(options: {
  script: 'transcribe_cli.py' | 'embed_cli.py',
  inputPath: string,
  model?: string,
  chunkSize?: number,
  remuxMp3?: boolean,
  senderWebContents?: Electron.WebContents
}): Promise<AsrResult> {
  const { script, inputPath, model, chunkSize, remuxMp3 } = options

  // Store process for cancellation
  const processId = Date.now().toString()

  const shouldMirrorAsrOutputToMainStdio =
    process.env.CAPTION_EDITOR_MIRROR_ASR_OUTPUT_TO_STDIO === '1' ||
    process.env.NODE_ENV === 'test'

  const appendTail = (current: string, addition: string, maxChars: number) => {
    const combined = current + addition
    if (combined.length <= maxChars) return combined
    return combined.slice(combined.length - maxChars)
  }

  let stdoutTail = ''
  let stderrTail = ''

  const sendOutput = (type: 'stdout' | 'stderr', data: string) => {
    options.senderWebContents?.send('asr:output', { processId, type, data })

    if (shouldMirrorAsrOutputToMainStdio) {
      const prefix = `[asr:${processId}:${type}] `
      if (type === 'stdout') {
        process.stdout.write(prefix + data)
      } else {
        process.stderr.write(prefix + data)
      }
    }
  }

  let pythonCommand: string
  let pythonArgs: string[]
  let cwd: string

  // Playwright E2E tests opt into the legacy Python ASR path by exporting
  // CAPTION_EDITOR_RUN_TRANSCRIBE_FROM_CODE_TREE=1 (+ _CODE_TREE_ROOT).
  // Everything else uses the Rust binaries — both dev (`npm run
  // dev:electron:watch`) and the packaged .app go through the same
  // resolveRustAsrPaths() call below; only the resolved file path
  // differs. The Python branch stays until those tests are ported to
  // use the Rust binaries (or deleted along with transcribe/).
  const useLegacyPython = process.env.CAPTION_EDITOR_RUN_TRANSCRIBE_FROM_CODE_TREE === '1'

  if (useLegacyPython) {
    const codeTreeRoot = process.env.CAPTION_EDITOR_CODE_TREE_ROOT || path.join(__dirname, '..')
    pythonCommand = 'uv'
    pythonArgs = ['run', 'python', script, inputPath]
    cwd = path.join(codeTreeRoot, 'transcribe')
    if (script === 'transcribe_cli.py' && chunkSize !== undefined) pythonArgs.push('--chunk-size', chunkSize.toString())
    if (model) pythonArgs.push('--model', model)
    if (script === 'transcribe_cli.py' && remuxMp3) pythonArgs.push('--remux-mp3')

    const scriptPath = path.join(cwd, script)
    if (!existsSync(scriptPath)) {
      throw new Error(`${script} not found at ${scriptPath}`)
    }
  } else {
    const { transcribeRs, embedRs } = resolveRustAsrPaths()
    const rustBin = script === 'transcribe_cli.py' ? transcribeRs : embedRs
    pythonCommand = rustBin
    pythonArgs = [inputPath]
    if (script === 'transcribe_cli.py') {
      if (chunkSize !== undefined) pythonArgs.push('--chunk-size', chunkSize.toString())
      if (model) pythonArgs.push('--model', model)
      if (remuxMp3) pythonArgs.push('--remux-mp3')
      // transcribe-rs auto-embeds via a sibling embed-rs binary; pass
      // --embed-bin explicitly so the embed step uses the same one we
      // resolved here (regardless of install layout).
      pythonArgs.push('--embed-bin', embedRs)
    } else {
      // embed-rs
      if (model) pythonArgs.push('--model', model)
    }
    cwd = os.tmpdir()
  }

  options.senderWebContents?.send('asr:started', { processId })

  const { spawn } = await import('child_process')
  const binDir = path.join(os.homedir(), '.cache', 'caption_editor', 'bin')
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: existsSync(binDir)
      ? `${binDir}${path.delimiter}${process.env.PATH || ''}`
      : process.env.PATH,
  }
  if (!useLegacyPython) {
    const rustBin = pythonCommand
    env.CAPTION_EDITOR_FFMPEG = resolveBundledFfmpeg(rustBin)
  }

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

    proc.stdout?.on('data', (data) => {
      const chunk = data.toString()
      stdoutTail = appendTail(stdoutTail, chunk, 20_000)
      sendOutput('stdout', chunk)
    })
    proc.stderr?.on('data', (data) => {
      const chunk = data.toString()
      stderrTail = appendTail(stderrTail, chunk, 20_000)
      sendOutput('stderr', chunk)
    })

    proc.on('close', (code) => {
      activeProcesses.delete(processId)
      if (code === 0) {
        resolve({ success: true, script, processId })
      } else if (canceled || code === 143) {
        console.log(`[main] ASR ${script} process ${processId} canceled or terminated with code ${code}`)
        resolve({ success: false, error: 'Canceled', canceled: true })
      } else {
        const errorMsg = `Process exited with code ${code}`
        console.error(`[main] ASR ${script} ${errorMsg}`)
        const tail = (stderrTail || stdoutTail).trim()
        reject(new Error(tail ? `${errorMsg}\n\n--- process output (tail) ---\n${tail}` : errorMsg))
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
ipcMain.handle('asr:transcribe', async (event, options: {
  mediaFilePath: string,
  model?: string,
  chunkSize?: number,
  remuxMp3?: boolean
}) => {
  // If the output captions file already exists, back it up instead of letting the CLI fail
  const captionsPath = options.mediaFilePath.replace(path.extname(options.mediaFilePath), CAPTIONS_JSON_SUFFIX)
  try {
    await fs.access(captionsPath)
    // File exists — find a backup name that doesn't collide
    const backupPath = await findBackupPath(captionsPath, async (p) => {
      try { await fs.access(p); return true } catch { return false }
    })
    console.log(`[main] Backing up existing captions file: ${captionsPath} -> ${backupPath}`)
    await fs.rename(captionsPath, backupPath)
  } catch {
    // File doesn't exist, nothing to back up
  }

  const result = await runAsrTool({
    script: 'transcribe_cli.py',
    inputPath: options.mediaFilePath,
    model: options.model,
    chunkSize: options.chunkSize,
    remuxMp3: options.remuxMp3,
    senderWebContents: event.sender
  })

  if (result.success) {
    try {
      const hr = '='.repeat(76)
      console.log(hr)
      console.log('[main] asr:transcribe — Python finished OK. Reading captions file from disk (large files can take a moment)…')
      console.log('[main] asr:transcribe — path:', captionsPath)
      const readStart = Date.now()
      const content = await fs.readFile(captionsPath, 'utf-8')
      const readMs = Date.now() - readStart
      console.log(`[main] asr:transcribe — read ${content.length} characters in ${readMs}ms; sending to renderer over IPC (also can take a moment)`)
      console.log(hr)
      return {
        ...result,
        captionsPath,
        content
      }
    } catch (err) {
      console.error('[main] Failed to read generated captions JSON file:', err)
      return {
        success: false,
        error: `Transcription succeeded but failed to read result file: ${err instanceof Error ? err.message : 'Unknown error'}`
      }
    }
  }

  return result
})

/**
 * Run speaker embedding on captions JSON file
 */
ipcMain.handle('asr:embed', async (event, options: {
  captionsPath: string,
  model?: string
}) => {
  const result = await runAsrTool({
    script: 'embed_cli.py',
    inputPath: options.captionsPath,
    model: options.model,
    senderWebContents: event.sender
  })

  if (result.success) {
    try {
      const hr = '='.repeat(76)
      console.log(hr)
      console.log('[main] asr:embed — Python finished OK. Reading captions file from disk (embeddings make files large)…')
      console.log('[main] asr:embed — path:', options.captionsPath)
      const readStart = Date.now()
      const content = await fs.readFile(options.captionsPath, 'utf-8')
      const readMs = Date.now() - readStart
      console.log(`[main] asr:embed — read ${content.length} characters in ${readMs}ms; sending to renderer over IPC`)
      console.log(hr)
      return {
        ...result,
        content
      }
    } catch (err) {
      console.error('[main] Failed to read captions JSON file after embedding:', err)
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
  const t0 = performance.now()
  console.log('[main] processDroppedFiles called for', filePaths.length, 'files')

  type DroppedFileResult =
    | { type: 'captions_json5'; filePath: string; fileName: string; content: string }
    | { type: 'srt'; filePath: string; fileName: string; content: string }
    | { type: 'media'; filePath: string; fileName: string; url: string }

  const results: DroppedFileResult[] = []

  for (const filePath of filePaths) {
    try {
      const stats = await fs.stat(filePath)
      if (!stats.isFile()) continue

      const ext = path.extname(filePath).toLowerCase()
      const extensionWithoutDot = ext.substring(1)
      const lowerPath = filePath.toLowerCase()

      if (lowerPath.endsWith(CAPTIONS_JSON_SUFFIX) || lowerPath.endsWith('.captions_json')) {
        const content = await fs.readFile(filePath, 'utf-8')
        results.push({
          type: 'captions_json5',
          filePath,
          fileName: path.basename(filePath),
          content
        })
        console.log(`[main] Loaded captions JSON: ${filePath}`)
      } else if (srt_files.includes(extensionWithoutDot)) {
        const content = await fs.readFile(filePath, 'utf-8')
        results.push({
          type: 'srt',
          filePath,
          fileName: path.basename(filePath),
          content
        })
        console.log(`[main] Loaded SRT: ${filePath}`)
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

  console.log(`[main] processDroppedFiles done in ${(performance.now() - t0).toFixed(1)} ms`)
  return results
})
