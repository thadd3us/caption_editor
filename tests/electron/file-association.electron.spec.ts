import { test, expect, _electron as electron } from '@playwright/test'
import { ElectronApplication, Page } from '@playwright/test'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test.describe('File Association - Open VTT files from OS', () => {
  let electronApp: ElectronApplication
  let window: Page

  test('should open VTT file passed as command line argument and auto-load media', async () => {
    // Path to the test VTT file with media reference
    const vttFilePath = path.join(process.cwd(), 'tests/fixtures/with-media-reference.vtt')
    const audioFilePath = path.join(process.cwd(), 'tests/fixtures/OSR_us_000_0010_8k.wav')

    // Launch Electron with the VTT file as an argument (simulates double-clicking the file)
    electronApp = await electron.launch({
      args: [
        path.join(process.cwd(), 'dist-electron/main.cjs'),
        '--no-sandbox',
        vttFilePath  // Pass VTT file path as argument
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

    // Give the app time to process the file open event
    await window.waitForTimeout(2000)

    // Check that the VTT file was loaded by checking the store
    const storeState = await window.evaluate(() => {
      const store = (window as any).$store
      return {
        hasDocument: !!store?.document,
        cueCount: store?.document?.cues?.length || 0,
        filePath: store?.document?.filePath,
        metadata: store?.document?.metadata,
        mediaPath: store?.mediaPath,
        mediaFilePath: store?.mediaFilePath
      }
    })

    console.log('Store state after file open:', storeState)

    // Verify VTT file was loaded
    expect(storeState.hasDocument).toBe(true)
    expect(storeState.cueCount).toBe(3) // with-media-reference.vtt has 3 cues
    expect(storeState.filePath).toBe(vttFilePath)

    // Verify metadata contains media file reference
    expect(storeState.metadata).toBeTruthy()
    expect(storeState.metadata.mediaFilePath).toBe('OSR_us_000_0010_8k.wav')

    // Wait for media auto-load to complete
    await window.waitForTimeout(2000)

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
    // mediaFilePath is stored as a relative path when in the same directory as VTT
    if (mediaState.mediaFilePath) {
      expect(mediaState.mediaFilePath).toBe('OSR_us_000_0010_8k.wav')
    }

    // Verify the audio element has the media loaded
    const audioElement = await window.locator('audio')
    await expect(audioElement).toBeVisible()

    const audioSrc = await audioElement.getAttribute('src')
    expect(audioSrc).toBeTruthy()
    console.log('Audio src:', audioSrc)

    // Verify we can see the cues in the table
    const captionTable = await window.locator('.ag-center-cols-container')
    await expect(captionTable).toBeVisible()

    // Check that the first cue is visible
    const firstCueText = await window.evaluate(() => {
      const store = (window as any).$store
      return store?.document?.cues?.[0]?.text
    })
    expect(firstCueText).toBe('The birch canoe slid on the smooth planks.')

    // Clean up
    await electronApp.close()
  })

  test('should handle open-file event on macOS', async () => {
    const vttFilePath = path.join(process.cwd(), 'tests/fixtures/with-media-reference.vtt')

    // Launch Electron without file argument first
    electronApp = await electron.launch({
      args: [path.join(process.cwd(), 'dist-electron/main.cjs'), '--no-sandbox'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DISPLAY: process.env.DISPLAY || ':99'
      }
    })

    window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // Simulate macOS open-file event by calling the IPC handler directly
    await electronApp.evaluate(async ({ app }, filePath) => {
      // Emit the open-file event
      app.emit('open-file', { preventDefault: () => {} } as any, filePath)
    }, vttFilePath)

    // Give the app time to process
    await window.waitForTimeout(2000)

    // Check that the file was loaded
    const storeState = await window.evaluate(() => {
      const store = (window as any).$store
      return {
        cueCount: store?.document?.cues?.length || 0,
        filePath: store?.document?.filePath
      }
    })

    console.log('Store state after open-file event:', storeState)

    expect(storeState.cueCount).toBe(3)
    expect(storeState.filePath).toBe(vttFilePath)

    await electronApp.close()
  })

  test('should have onFileOpen API exposed', async () => {
    electronApp = await electron.launch({
      args: [path.join(process.cwd(), 'dist-electron/main.cjs'), '--no-sandbox'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DISPLAY: process.env.DISPLAY || ':99'
      }
    })

    window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // Check that onFileOpen API is available
    const hasOnFileOpen = await window.evaluate(() => {
      return typeof window.electronAPI?.onFileOpen === 'function'
    })

    expect(hasOnFileOpen).toBe(true)

    await electronApp.close()
  })
})
