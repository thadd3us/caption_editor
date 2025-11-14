import { test, expect, _electron as electron } from '@playwright/test'
import { ElectronApplication, Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs/promises'
import { fileURLToPath } from 'url'
import { enableConsoleCapture } from '../helpers/console'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test.describe('Electron VTT Media Auto-loading', () => {
  let electronApp: ElectronApplication
  let window: Page

  test.beforeAll(async () => {
    // Launch Electron app
    electronApp = await electron.launch({
      args: [path.join(process.cwd(), 'dist-electron/main.cjs'), '--no-sandbox'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DISPLAY: process.env.DISPLAY || ':99'
      }
    })

    // Wait for the first window
    window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    enableConsoleCapture(window)
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test('should auto-load media file when VTT has mediaFilePath metadata', async () => {
    test.setTimeout(30000)

    // Use the actual test fixture files
    const vttPath = path.join(process.cwd(), 'test_data/with-media-reference.vtt')
    const mediaPath = path.join(process.cwd(), 'test_data/OSR_us_000_0010_8k.wav')

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
        segmentCount: store.document.segments.length,
        metadata: store.document.metadata,
        mediaPath: store.mediaPath,
        mediaFilePath: store.mediaFilePath
      }
    }, vttPath)

    console.log('After VTT load:', result)

    // Verify VTT was loaded
    expect(result).toBeTruthy()
    expect(result!.segmentCount).toBe(3)
    // Media path should be converted to absolute path internally
    expect(result!.metadata.mediaFilePath).toBe(mediaPath)

    // Wait for auto-load to happen (App.vue handles this via watch)
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
    expect(finalState.mediaPath).toContain('OSR_us_000_0010_8k.wav')
    expect(finalState.hasAudio).toBe(true)
  })

  test('should handle missing media file gracefully', async () => {
    test.setTimeout(30000)

    // Clear any previous state by loading an empty document and clearing media
    await window.evaluate(() => {
      const store = (window as any).$store
      if (store) {
        // Load empty VTT to reset state
        store.loadFromFile('WEBVTT\n', null)
        // Clear media path manually
        store.mediaPath = null
      }
    })
    await window.waitForTimeout(200)

    // Create a VTT with a non-existent media reference
    const testVTTPath = path.join(process.cwd(), 'test_data/missing-media-ref.vtt')
    const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:TranscriptMetadata {"id":"550e8400-e29b-41d4-a716-446655440000","mediaFilePath":"nonexistent-file.wav"}

NOTE CAPTION_EDITOR:VTTCueMetadata {"id":"84ec6681-574b-4570-aecb-5bcaea9415a9","timestamp":"2025-10-31T00:00:00.000Z"}

84ec6681-574b-4570-aecb-5bcaea9415a9
00:00:00.000 --> 00:00:03.000
Test caption
`

    await fs.mkdir(path.join(process.cwd(), 'test_data'), { recursive: true })
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

    // Wait for auto-load attempt (App.vue handles this, should fail gracefully)
    await window.waitForTimeout(500)

    // Verify media was NOT loaded
    const state = await window.evaluate(() => {
      const store = (window as any).$store
      return {
        mediaPath: store.mediaPath,
        segmentCount: store.document.segments.length,
        hasMetadata: !!store.document.metadata.mediaFilePath
      }
    })

    expect(state.segmentCount).toBe(1)
    expect(state.hasMetadata).toBe(true)
    expect(state.mediaPath).toBeFalsy() // Should not have loaded any media

    // Clean up
    await fs.unlink(testVTTPath).catch(() => {})
  })

  test('should not auto-load if media is already loaded', async () => {
    test.setTimeout(30000)

    // First, manually load a media file
    const mediaPath = path.join(process.cwd(), 'test_data/OSR_us_000_0010_8k.wav')

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
    const vttPath = path.join(process.cwd(), 'test_data/with-media-reference.vtt')

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

    // Wait for any potential auto-load attempt (App.vue should skip since media is already loaded)
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
