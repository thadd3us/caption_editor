import { test, expect, _electron as electron } from '@playwright/test'
import { ElectronApplication, Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs/promises'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test.describe('Electron VTT Media Auto-loading', () => {
  let electronApp: ElectronApplication
  let window: Page

  test.beforeAll(async () => {
    // Launch Electron app
    electronApp = await electron.launch({
      args: [path.join(process.cwd(), 'dist-electron/main.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
    })

    // Wait for the first window
    window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test('should auto-load media file when VTT has mediaFilePath metadata', async () => {
    test.setTimeout(30000)

    // Use the actual test fixture files
    const vttPath = path.join(process.cwd(), 'tests/fixtures/with-media-reference.vtt')
    const mediaPath = path.join(process.cwd(), 'tests/fixtures/OSR_us_000_0010_8k.wav')

    // Verify both files exist
    await fs.access(vttPath)
    await fs.access(mediaPath)

    // Process the VTT file through electronAPI (simulating a file drop)
    const result = await window.evaluate(async (filePath) => {
      if (!window.electronAPI) return null
      const results = await window.electronAPI.processDroppedFiles([filePath])

      // Simulate the FileDropZone component processing the results
      const store = (window as any).$store
      if (!store) return null

      for (const res of results) {
        if (res.type === 'vtt' && res.content) {
          store.loadFromFile(res.content, res.filePath)
        }
      }

      // Return the store state after loading
      return {
        cueCount: store.document.cues.length,
        metadata: store.document.metadata,
        mediaPath: store.mediaPath,
        mediaFilePath: store.mediaFilePath
      }
    }, vttPath)

    console.log('After VTT load:', result)

    // Verify VTT was loaded
    expect(result).toBeTruthy()
    expect(result!.cueCount).toBe(3)
    expect(result!.metadata.mediaFilePath).toBe('OSR_us_000_0010_8k.wav')

    // Now trigger the auto-load function
    await window.evaluate(async (vttPath) => {
      const store = (window as any).$store
      const metadata = store.document.metadata
      const mediaFilePath = metadata?.mediaFilePath

      if (!mediaFilePath || !window.electronAPI) return

      // Skip if media already loaded
      if (store.mediaPath) return

      // Resolve the media file path relative to the VTT file directory
      const vttDir = vttPath.substring(0, vttPath.lastIndexOf('/') || vttPath.lastIndexOf('\\'))
      const resolvedMediaPath = vttDir + '/' + mediaFilePath.replace(/\\/g, '/')

      console.log('Attempting to auto-load media from:', resolvedMediaPath)

      // Check if the file exists
      const stats = await window.electronAPI.statFile(resolvedMediaPath)

      if (stats.success && stats.exists && stats.isFile) {
        // Convert to URL and load
        const urlResult = await window.electronAPI.fileToURL(resolvedMediaPath)

        if (urlResult.success && urlResult.url) {
          store.loadMediaFile(urlResult.url, resolvedMediaPath)
          console.log('Successfully auto-loaded media file')
        }
      }
    }, vttPath)

    // Wait for media to load
    await window.waitForTimeout(1000)

    // Verify media was auto-loaded
    const finalState = await window.evaluate(() => {
      const store = (window as any).$store
      return {
        mediaPath: store.mediaPath,
        mediaFilePath: store.mediaFilePath,
        hasAudio: !!document.querySelector('audio')
      }
    })

    console.log('Final state:', finalState)

    expect(finalState.mediaPath).toBeTruthy()
    expect(finalState.mediaFilePath).toContain('OSR_us_000_0010_8k.wav')
    expect(finalState.hasAudio).toBe(true)
  })

  test('should handle missing media file gracefully', async () => {
    test.setTimeout(30000)

    // Create a VTT with a non-existent media reference
    const testVTTPath = path.join(process.cwd(), 'tests/fixtures/missing-media-ref.vtt')
    const vttContent = `WEBVTT

NOTE {"id":"550e8400-e29b-41d4-a716-446655440000","mediaFilePath":"nonexistent-file.wav"}

NOTE {"id":"84ec6681-574b-4570-aecb-5bcaea9415a9"}

84ec6681-574b-4570-aecb-5bcaea9415a9
00:00:00.000 --> 00:00:03.000
Test caption
`

    await fs.mkdir(path.join(process.cwd(), 'tests/fixtures'), { recursive: true })
    await fs.writeFile(testVTTPath, vttContent)

    // Load the VTT
    await window.evaluate(async (filePath) => {
      if (!window.electronAPI) return
      const results = await window.electronAPI.processDroppedFiles([filePath])

      const store = (window as any).$store
      for (const res of results) {
        if (res.type === 'vtt' && res.content) {
          store.loadFromFile(res.content, res.filePath)
        }
      }
    }, testVTTPath)

    // Try to auto-load media (should fail gracefully)
    await window.evaluate(async (vttPath) => {
      const store = (window as any).$store
      const metadata = store.document.metadata
      const mediaFilePath = metadata?.mediaFilePath

      if (!mediaFilePath || !window.electronAPI) return

      const vttDir = vttPath.substring(0, vttPath.lastIndexOf('/') || vttPath.lastIndexOf('\\'))
      const resolvedMediaPath = vttDir + '/' + mediaFilePath.replace(/\\/g, '/')

      const stats = await window.electronAPI.statFile(resolvedMediaPath)

      if (stats.success && stats.exists && stats.isFile) {
        const urlResult = await window.electronAPI.fileToURL(resolvedMediaPath)
        if (urlResult.success && urlResult.url) {
          store.loadMediaFile(urlResult.url, resolvedMediaPath)
        }
      }
    }, testVTTPath)

    await window.waitForTimeout(500)

    // Verify media was NOT loaded
    const state = await window.evaluate(() => {
      const store = (window as any).$store
      return {
        mediaPath: store.mediaPath,
        cueCount: store.document.cues.length,
        hasMetadata: !!store.document.metadata.mediaFilePath
      }
    })

    expect(state.cueCount).toBe(1)
    expect(state.hasMetadata).toBe(true)
    expect(state.mediaPath).toBeFalsy() // Should not have loaded any media

    // Clean up
    await fs.unlink(testVTTPath).catch(() => {})
  })

  test('should not auto-load if media is already loaded', async () => {
    test.setTimeout(30000)

    // First, manually load a media file
    const mediaPath = path.join(process.cwd(), 'tests/fixtures/OSR_us_000_0010_8k.wav')

    await window.evaluate(async (filePath) => {
      if (!window.electronAPI) return
      const results = await window.electronAPI.processDroppedFiles([filePath])

      const store = (window as any).$store
      for (const res of results) {
        if (res.type === 'media' && res.url) {
          store.loadMediaFile(res.url, res.filePath)
        }
      }
    }, mediaPath)

    await window.waitForTimeout(500)

    const initialMediaPath = await window.evaluate(() => {
      const store = (window as any).$store
      return store.mediaPath
    })

    console.log('Initial media path:', initialMediaPath)
    expect(initialMediaPath).toBeTruthy()

    // Now load VTT with media reference
    const vttPath = path.join(process.cwd(), 'tests/fixtures/with-media-reference.vtt')

    await window.evaluate(async (filePath) => {
      if (!window.electronAPI) return
      const results = await window.electronAPI.processDroppedFiles([filePath])

      const store = (window as any).$store
      for (const res of results) {
        if (res.type === 'vtt' && res.content) {
          store.loadFromFile(res.content, res.filePath)
        }
      }
    }, vttPath)

    // Try to auto-load (should skip because media is already loaded)
    await window.evaluate(async (vttPath) => {
      const store = (window as any).$store
      const metadata = store.document.metadata
      const mediaFilePath = metadata?.mediaFilePath

      if (!mediaFilePath || !window.electronAPI) return

      // This should skip because store.mediaPath is already set
      if (store.mediaPath) {
        console.log('Skipping auto-load, media already loaded')
        return
      }

      const vttDir = vttPath.substring(0, vttPath.lastIndexOf('/') || vttPath.lastIndexOf('\\'))
      const resolvedMediaPath = vttDir + '/' + mediaFilePath.replace(/\\/g, '/')

      const stats = await window.electronAPI.statFile(resolvedMediaPath)
      if (stats.success && stats.exists && stats.isFile) {
        const urlResult = await window.electronAPI.fileToURL(resolvedMediaPath)
        if (urlResult.success && urlResult.url) {
          store.loadMediaFile(urlResult.url, resolvedMediaPath)
        }
      }
    }, vttPath)

    await window.waitForTimeout(500)

    // Verify media path hasn't changed
    const finalMediaPath = await window.evaluate(() => {
      const store = (window as any).$store
      return store.mediaPath
    })

    console.log('Final media path:', finalMediaPath)
    expect(finalMediaPath).toBe(initialMediaPath)
  })
})
