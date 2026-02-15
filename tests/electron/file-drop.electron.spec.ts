import { sharedElectronTest as test, expect } from '../helpers/shared-electron'
import * as path from 'path'
import * as fs from 'fs/promises'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test.describe('File Drop', () => {
  // Using shared Electron instance - no beforeEach/afterEach needed

  test('should handle captions JSON file drops', async ({ page }) => {
    const captionsFilePath = path.resolve(__dirname, '../../test_data/drop-sample.captions.json')
    const captionsJson = JSON.stringify({
      metadata: { id: 'doc_1' },
      segments: [
        { id: 'seg_1', startTime: 0, endTime: 5, text: 'First caption' },
        { id: 'seg_2', startTime: 5, endTime: 10, text: 'Second caption' }
      ]
    })
    await fs.writeFile(captionsFilePath, captionsJson, 'utf-8')

    const result = await page.evaluate(async (filePath) => {
      const api = (window as any).electronAPI
      if (!api || !api.processDroppedFiles) {
        throw new Error('electronAPI.processDroppedFiles not available')
      }

      return await api.processDroppedFiles([filePath])
    }, captionsFilePath)

    expect(result).toBeDefined()
    expect(result.length).toBe(1)
    expect(result[0].type).toBe('captions_json')
    expect(result[0].filePath).toBe(captionsFilePath)
    expect(result[0].content).toContain('First caption')

    await page.evaluate((fileResult) => {
      const store = (window as any).$store
      if (!store) {
        throw new Error('$store not available')
      }
      store.loadFromFile(fileResult.content, fileResult.filePath)
    }, result[0])

    await page.waitForTimeout(200)

    const rows = await page.locator('.ag-row').all()
    expect(rows.length).toBeGreaterThan(0)

    await fs.unlink(captionsFilePath).catch(() => {})
  })

  test('should handle WAV file drops', async ({ page }) => {
    const wavFilePath = path.resolve(__dirname, '../../test_data/OSR_us_000_0010_8k.wav')
    await fs.access(wavFilePath)

    const result = await page.evaluate(async (filePath) => {
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
    expect(result[0].url).toContain('media://')

    // Verify the media file gets loaded into the store
    const mediaPath = await page.evaluate((fileResult) => {
      const store = (window as any).$store
      if (!store) {
        throw new Error('$store not available')
      }
      store.loadMediaFile(fileResult.url, fileResult.filePath)
      return store.mediaFilePath
    }, result[0])

    expect(mediaPath).toBe(wavFilePath)
  })

  test('should handle dropping both captions and WAV files together', async ({ page }) => {
    const captionsFilePath = path.resolve(__dirname, '../../test_data/drop-sample.captions.json')
    const wavFilePath = path.resolve(__dirname, '../../test_data/test-audio-10s.wav')

    await fs.writeFile(
      captionsFilePath,
      JSON.stringify({
        metadata: { id: 'doc_1' },
        segments: [{ id: 'seg_1', startTime: 0, endTime: 5, text: 'Dropped caption' }]
      }),
      'utf-8'
    )
    await fs.access(wavFilePath)

    const result = await page.evaluate(async (filePaths) => {
      const api = (window as any).electronAPI
      if (!api || !api.processDroppedFiles) {
        throw new Error('electronAPI.processDroppedFiles not available')
      }

      return await api.processDroppedFiles(filePaths)
    }, [captionsFilePath, wavFilePath])

    expect(result).toBeDefined()
    expect(result.length).toBe(2)

    const captionsResult = result.find((r: any) => r.type === 'captions_json')
    const mediaResult = result.find((r: any) => r.type === 'media')

    expect(captionsResult).toBeDefined()
    expect(mediaResult).toBeDefined()
    expect(captionsResult.filePath).toBe(captionsFilePath)
    expect(mediaResult.filePath).toBe(wavFilePath)

    await page.evaluate((results) => {
      const store = (window as any).$store
      if (!store) {
        throw new Error('$store not available')
      }

      const captions = results.find((r: any) => r.type === 'captions_json')
      const media = results.find((r: any) => r.type === 'media')

      if (captions) {
        store.loadFromFile(captions.content, captions.filePath)
      }
      if (media) {
        store.loadMediaFile(media.url, media.filePath)
      }
    }, result)

    await page.waitForTimeout(200)

    // Verify both files were loaded
    const storeState = await page.evaluate(() => {
      const store = (window as any).$store
      return {
        segmentCount: store.document.segments.length,
        mediaPath: store.mediaFilePath
      }
    })

    expect(storeState.segmentCount).toBeGreaterThan(0)
    expect(storeState.mediaPath).toBe(wavFilePath)

    await fs.unlink(captionsFilePath).catch(() => {})
  })
})
