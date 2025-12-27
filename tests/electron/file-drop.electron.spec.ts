import { test, expect, _electron as electron } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs/promises'
import { fileURLToPath } from 'url'
import { getElectronMainPath } from '../helpers/project-root'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test.describe('File Drop', () => {
  test('should handle VTT file drops', async () => {
    const electronApp = await electron.launch({
      args: [
        getElectronMainPath(),
        '--no-sandbox',
        '--disable-dev-shm-usage'
      ],
      env: {
        ...process.env,
        DISPLAY: process.env.DISPLAY || ':99'
      }
    })

    const window = await electronApp.firstWindow()

    // Wait for app to be ready
    await window.waitForLoadState('domcontentloaded')
    await window.waitForTimeout(500)

    // Prepare test VTT file path (absolute path)
    const vttFilePath = path.resolve(__dirname, '../../test_data/sample.vtt')

    // Verify file exists
    await fs.access(vttFilePath)

    // Read the file content for verification
    const vttContent = await fs.readFile(vttFilePath, 'utf-8')
    expect(vttContent).toContain('WEBVTT')

    // Simulate file drop by calling the IPC handler directly
    // This bypasses the drag-and-drop DOM events and tests the core file processing logic
    const result = await window.evaluate(async (filePath) => {
      const api = (window as any).electronAPI
      if (!api || !api.processDroppedFiles) {
        throw new Error('electronAPI.processDroppedFiles not available')
      }

      return await api.processDroppedFiles([filePath])
    }, vttFilePath)

    console.log('[Test] processDroppedFiles result:', result)

    // Verify the result
    expect(result).toBeDefined()
    expect(result.length).toBe(1)
    expect(result[0].type).toBe('vtt')
    expect(result[0].filePath).toBe(vttFilePath)
    expect(result[0].content).toContain('WEBVTT')

    // Now load the file into the store
    await window.evaluate((fileResult) => {
      const store = (window as any).__vttStore
      if (!store) {
        throw new Error('__vttStore not available')
      }

      store.loadFromFile(fileResult.content, fileResult.filePath)
    }, result[0])

    // Wait a bit for the UI to update
    await window.waitForTimeout(500)

    // Verify the file was loaded by checking the table
    const rows = await window.locator('.ag-row').all()
    console.log('[Test] Number of rows after loading:', rows.length)
    expect(rows.length).toBeGreaterThan(0)

    await electronApp.close()
  })

  test('should handle WAV file drops', async () => {
    const electronApp = await electron.launch({
      args: [
        getElectronMainPath(),
        '--no-sandbox',
        '--disable-dev-shm-usage'
      ],
      env: {
        ...process.env,
        DISPLAY: process.env.DISPLAY || ':99'
      }
    })

    const window = await electronApp.firstWindow()

    // Wait for app to be ready
    await window.waitForLoadState('domcontentloaded')
    await window.waitForTimeout(500)

    // Prepare test WAV file path (absolute path)
    const wavFilePath = path.resolve(__dirname, '../../test_data/OSR_us_000_0010_8k.wav')

    // Verify file exists
    await fs.access(wavFilePath)

    // Simulate file drop by calling the IPC handler directly
    const result = await window.evaluate(async (filePath) => {
      const api = (window as any).electronAPI
      if (!api || !api.processDroppedFiles) {
        throw new Error('electronAPI.processDroppedFiles not available')
      }

      return await api.processDroppedFiles([filePath])
    }, wavFilePath)

    console.log('[Test] processDroppedFiles result:', result)

    // Verify the result
    expect(result).toBeDefined()
    expect(result.length).toBe(1)
    expect(result[0].type).toBe('media')
    expect(result[0].filePath).toBe(wavFilePath)
    expect(result[0].url).toContain('file://')

    // Now load the media file into the store
    await window.evaluate((fileResult) => {
      const store = (window as any).__vttStore
      if (!store) {
        throw new Error('__vttStore not available')
      }

      store.loadMediaFile(fileResult.url, fileResult.filePath)
    }, result[0])

    // Wait a bit for the media to load
    await window.waitForTimeout(500)

    // Verify media was loaded by checking the video element
    const video = await window.locator('video')
    expect(video).toBeDefined()

    const videoSrc = await video.getAttribute('src')
    console.log('[Test] Video src:', videoSrc)
    expect(videoSrc).toContain('file://')

    await electronApp.close()
  })

  test('should handle dropping both VTT and WAV files together', async () => {
    const electronApp = await electron.launch({
      args: [
        getElectronMainPath(),
        '--no-sandbox',
        '--disable-dev-shm-usage'
      ],
      env: {
        ...process.env,
        DISPLAY: process.env.DISPLAY || ':99'
      }
    })

    const window = await electronApp.firstWindow()

    // Wait for app to be ready
    await window.waitForLoadState('domcontentloaded')
    await window.waitForTimeout(500)

    // Prepare test file paths
    const vttFilePath = path.resolve(__dirname, '../../test_data/sample.vtt')
    const wavFilePath = path.resolve(__dirname, '../../test_data/test-audio-10s.wav')

    // Verify files exist
    await fs.access(vttFilePath)
    await fs.access(wavFilePath)

    // Simulate dropping both files
    const result = await window.evaluate(async (filePaths) => {
      const api = (window as any).electronAPI
      if (!api || !api.processDroppedFiles) {
        throw new Error('electronAPI.processDroppedFiles not available')
      }

      return await api.processDroppedFiles(filePaths)
    }, [vttFilePath, wavFilePath])

    console.log('[Test] processDroppedFiles result:', result)

    // Verify the result
    expect(result).toBeDefined()
    expect(result.length).toBe(2)

    // Find VTT and media results
    const vttResult = result.find((r: any) => r.type === 'vtt')
    const mediaResult = result.find((r: any) => r.type === 'media')

    expect(vttResult).toBeDefined()
    expect(mediaResult).toBeDefined()

    expect(vttResult.filePath).toBe(vttFilePath)
    expect(mediaResult.filePath).toBe(wavFilePath)

    // Load both files into the store
    await window.evaluate((results) => {
      const store = (window as any).__vttStore
      if (!store) {
        throw new Error('__vttStore not available')
      }

      const vtt = results.find((r: any) => r.type === 'vtt')
      const media = results.find((r: any) => r.type === 'media')

      if (vtt) {
        store.loadFromFile(vtt.content, vtt.filePath)
      }
      if (media) {
        store.loadMediaFile(media.url, media.filePath)
      }
    }, result)

    // Wait for everything to load
    await window.waitForTimeout(500)

    // Verify both files were loaded
    const rows = await window.locator('.ag-row').all()
    expect(rows.length).toBeGreaterThan(0)

    const video = await window.locator('video')
    const videoSrc = await video.getAttribute('src')
    expect(videoSrc).toContain('file://')

    await electronApp.close()
  })
})
