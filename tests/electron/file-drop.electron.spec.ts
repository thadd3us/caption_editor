import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs/promises'
import { fileURLToPath } from 'url'
import { getElectronMainPath } from '../helpers/project-root'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test.describe('File Drop', () => {
  let electronApp: ElectronApplication
  let window: Page

  test.beforeEach(async () => {
    electronApp = await electron.launch({
      args: [getElectronMainPath(), '--no-sandbox'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DISPLAY: process.env.DISPLAY || ':99'
      }
    })

    window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
  })

  test.afterEach(async () => {
    if (electronApp) {
      await electronApp.close().catch(() => {})
    }
  })

  test('should handle VTT file drops', async () => {
    const vttFilePath = path.resolve(__dirname, '../../test_data/sample.vtt')
    await fs.access(vttFilePath)

    const result = await window.evaluate(async (filePath) => {
      const api = (window as any).electronAPI
      if (!api || !api.processDroppedFiles) {
        throw new Error('electronAPI.processDroppedFiles not available')
      }

      return await api.processDroppedFiles([filePath])
    }, vttFilePath)

    expect(result).toBeDefined()
    expect(result.length).toBe(1)
    expect(result[0].type).toBe('vtt')
    expect(result[0].filePath).toBe(vttFilePath)
    expect(result[0].content).toContain('WEBVTT')

    await window.evaluate((fileResult) => {
      const store = (window as any).__vttStore
      if (!store) {
        throw new Error('__vttStore not available')
      }
      store.loadFromFile(fileResult.content, fileResult.filePath)
    }, result[0])

    await window.waitForTimeout(200)

    const rows = await window.locator('.ag-row').all()
    expect(rows.length).toBeGreaterThan(0)
  })

  test('should handle WAV file drops', async () => {
    const wavFilePath = path.resolve(__dirname, '../../test_data/OSR_us_000_0010_8k.wav')
    await fs.access(wavFilePath)

    const result = await window.evaluate(async (filePath) => {
      const api = (window as any).electronAPI
      if (!api || !api.processDroppedFiles) {
        throw new Error('electronAPI.processDroppedFiles not available')
      }

      return await api.processDroppedFiles([filePath])
    }, wavFilePath)

    expect(result).toBeDefined()
    expect(result.length).toBe(1)
    expect(result[0].type).toBe('media')
    expect(result[0].filePath).toBe(wavFilePath)
    expect(result[0].url).toContain('file://')

    // Verify the media file gets loaded into the store
    const mediaPath = await window.evaluate((fileResult) => {
      const store = (window as any).__vttStore
      if (!store) {
        throw new Error('__vttStore not available')
      }
      store.loadMediaFile(fileResult.url, fileResult.filePath)
      return store.mediaFilePath
    }, result[0])

    expect(mediaPath).toBe(wavFilePath)
  })

  test('should handle dropping both VTT and WAV files together', async () => {
    const vttFilePath = path.resolve(__dirname, '../../test_data/sample.vtt')
    const wavFilePath = path.resolve(__dirname, '../../test_data/test-audio-10s.wav')

    await fs.access(vttFilePath)
    await fs.access(wavFilePath)

    const result = await window.evaluate(async (filePaths) => {
      const api = (window as any).electronAPI
      if (!api || !api.processDroppedFiles) {
        throw new Error('electronAPI.processDroppedFiles not available')
      }

      return await api.processDroppedFiles(filePaths)
    }, [vttFilePath, wavFilePath])

    expect(result).toBeDefined()
    expect(result.length).toBe(2)

    const vttResult = result.find((r: any) => r.type === 'vtt')
    const mediaResult = result.find((r: any) => r.type === 'media')

    expect(vttResult).toBeDefined()
    expect(mediaResult).toBeDefined()
    expect(vttResult.filePath).toBe(vttFilePath)
    expect(mediaResult.filePath).toBe(wavFilePath)

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

    await window.waitForTimeout(200)

    // Verify both files were loaded
    const storeState = await window.evaluate(() => {
      const store = (window as any).__vttStore
      return {
        segmentCount: store.document.segments.length,
        mediaPath: store.mediaFilePath
      }
    })

    expect(storeState.segmentCount).toBeGreaterThan(0)
    expect(storeState.mediaPath).toBe(wavFilePath)
  })
})
