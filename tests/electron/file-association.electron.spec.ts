import { test, expect, _electron as electron } from '@playwright/test'
import { ElectronApplication, Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs/promises'
import { fileURLToPath } from 'url'
import { enableConsoleCapture } from '../helpers/console'
import { getProjectRoot, getElectronMainPath } from '../helpers/project-root'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test.describe('File Association - Open captions files from OS', () => {
  let electronApp: ElectronApplication
  let window: Page

  test('should open captions file passed as command line argument and auto-load media', async () => {
    const audioFilePath = path.join(getProjectRoot(), 'test_data/OSR_us_000_0010_8k.wav')
    const tempDir = path.join(getProjectRoot(), 'test_data', 'temp-file-association')
    await fs.mkdir(tempDir, { recursive: true })
    const captionsFilePath = path.join(tempDir, 'with-media-reference.captions_json')

    // Create a dedicated captions fixture for this test (do not depend on shared test_data files)
    await fs.writeFile(
      captionsFilePath,
      JSON.stringify(
        {
          metadata: { id: 'file-association-doc', mediaFilePath: audioFilePath },
          segments: [
            { id: 'seg1', startTime: 0, endTime: 4, text: 'The birch canoe slid on the smooth planks.' },
            { id: 'seg2', startTime: 4, endTime: 8, text: 'Glue the sheet to the dark blue background.' },
            { id: 'seg3', startTime: 8, endTime: 12, text: 'It is easy to tell the depth of a well.' }
          ]
        },
        null,
        2
      ),
      'utf-8'
    )

    // Launch Electron with the captions file as an argument (simulates double-clicking the file)
    electronApp = await electron.launch({
      args: [
        path.join(getElectronMainPath()),
        '--no-sandbox',
        captionsFilePath
      ],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DISPLAY: process.env.DISPLAY || ':99'
      }
    })

    // Wait for the first window
    window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // Capture console output for debugging
    enableConsoleCapture(window)

    // Check store state before waiting
    const initialCheck = await window.evaluate(() => {
      const store = (window as any).$store
      return {
        storeExists: !!store,
        documentExists: !!store?.document,
        segmentsLength: store?.document?.segments?.length || 0,
        filePath: store?.document?.filePath,
        metadataMediaPath: store?.document?.metadata?.mediaFilePath
      }
    })
    console.log('Initial store state:', initialCheck)

    // Wait for the captions file to be loaded (check that segments are loaded)
    await window.waitForFunction(
      () => {
        const store = (window as any).$store
        return store && store.document && store.document.segments && store.document.segments.length > 0
      },
      { timeout: 5000 }
    )

    // Check that the captions file was loaded by checking the store
    const storeState = await window.evaluate(() => {
      const store = (window as any).$store
      return {
        hasDocument: !!store?.document,
        segmentCount: store?.document?.segments?.length || 0,
        filePath: store?.document?.filePath,
        metadata: store?.document?.metadata,
        mediaPath: store?.mediaPath,
        mediaFilePath: store?.mediaFilePath
      }
    })

    console.log('Store state after file open:', storeState)

    // Verify captions file was loaded
    expect(storeState.hasDocument).toBe(true)
    expect(storeState.segmentCount).toBe(3)
    expect(storeState.filePath).toBe(captionsFilePath)

    // Verify metadata contains media file reference
    // Note: After auto-load, the path is stored as absolute path internally
    expect(storeState.metadata).toBeTruthy()
    expect(storeState.metadata.mediaFilePath).toBe(audioFilePath)

    // Wait for media auto-load to complete (check that mediaPath is set)
    await window.waitForFunction(
      () => {
        const store = (window as any).$store
        return store?.mediaPath !== null && store?.mediaPath !== undefined
      },
      { timeout: 5000 }
    )

    // Check that media was auto-loaded
    const mediaState = await window.evaluate(() => {
      const store = (window as any).$store
      return {
        mediaPath: store?.mediaPath,
        mediaFilePath: store?.mediaFilePath
      }
    })

    console.log('Media state after auto-load:', mediaState)

    // Verify media file was auto-loaded
    expect(mediaState.mediaPath).toBeTruthy()
    expect(mediaState.mediaPath).toContain('OSR_us_000_0010_8k.wav')
    // mediaFilePath is now stored as absolute path internally
    if (mediaState.mediaFilePath) {
      expect(mediaState.mediaFilePath).toBe(audioFilePath)
    }

    // Verify the audio element has the media loaded
    const audioElement = await window.locator('audio')
    await expect(audioElement).toBeVisible()

    const audioSrc = await audioElement.getAttribute('src')
    expect(audioSrc).toBeTruthy()
    console.log('Audio src:', audioSrc)

    // Verify we can see the segments in the table
    const captionTable = await window.locator('.ag-center-cols-container')
    await expect(captionTable).toBeVisible()

    // Check that the first segment is visible
    const firstSegmentText = await window.evaluate(() => {
      const store = (window as any).$store
      return store?.document?.segments?.[0]?.text
    })
    expect(firstSegmentText).toBe('The birch canoe slid on the smooth planks.')

    // Clean up
    await electronApp.close()
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
  })

  test('should handle open-file event on macOS', async () => {
    const audioFilePath = path.join(getProjectRoot(), 'test_data/OSR_us_000_0010_8k.wav')
    const tempDir = path.join(getProjectRoot(), 'test_data', 'temp-file-association')
    await fs.mkdir(tempDir, { recursive: true })
    const captionsFilePath = path.join(tempDir, 'with-media-reference-macos.captions_json')

    await fs.writeFile(
      captionsFilePath,
      JSON.stringify(
        {
          metadata: { id: 'file-association-doc-macos', mediaFilePath: audioFilePath },
          segments: [
            { id: 'seg1', startTime: 0, endTime: 4, text: 'The birch canoe slid on the smooth planks.' },
            { id: 'seg2', startTime: 4, endTime: 8, text: 'Glue the sheet to the dark blue background.' },
            { id: 'seg3', startTime: 8, endTime: 12, text: 'It is easy to tell the depth of a well.' }
          ]
        },
        null,
        2
      ),
      'utf-8'
    )

    // Launch Electron without file argument first
    electronApp = await electron.launch({
      args: [path.join(getElectronMainPath()), '--no-sandbox'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DISPLAY: process.env.DISPLAY || ':99'
      }
    })

    window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    enableConsoleCapture(window)

    // Simulate macOS open-file event by calling the IPC handler directly
    await electronApp.evaluate(async ({ app }, filePath) => {
      // Emit the open-file event
      app.emit('open-file', { preventDefault: () => {} } as any, filePath)
    }, captionsFilePath)

    // Wait for the captions file to be loaded (check that segments are loaded)
    await window.waitForFunction(
      () => {
        const store = (window as any).$store
        return store && store.document && store.document.segments && store.document.segments.length > 0
      },
      { timeout: 5000 }
    )

    // Check that the file was loaded
    const storeState = await window.evaluate(() => {
      const store = (window as any).$store
      return {
        segmentCount: store?.document?.segments?.length || 0,
        filePath: store?.document?.filePath
      }
    })

    console.log('Store state after open-file event:', storeState)

    expect(storeState.segmentCount).toBe(3)
    expect(storeState.filePath).toBe(captionsFilePath)

    await electronApp.close()
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
  })

  test('should have onFileOpen API exposed', async () => {
    electronApp = await electron.launch({
      args: [path.join(getElectronMainPath()), '--no-sandbox'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DISPLAY: process.env.DISPLAY || ':99'
      }
    })

    window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    enableConsoleCapture(window)

    // Check that onFileOpen API is available
    const hasOnFileOpen = await window.evaluate(() => {
      return typeof window.electronAPI?.onFileOpen === 'function'
    })

    expect(hasOnFileOpen).toBe(true)

    await electronApp.close()
  })
})
