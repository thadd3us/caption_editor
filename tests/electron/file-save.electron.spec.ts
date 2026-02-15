import { sharedElectronTest as test, expect } from '../helpers/shared-electron'
import * as path from 'path'
import * as fs from 'fs/promises'
import { getProjectRoot } from '../helpers/project-root'

test.describe('File Save - Save captions files correctly', () => {
  test('should include mediaFilePath in saved captions metadata', async ({ page }) => {
    // Create a temporary captions file
    const tempDir = path.join(getProjectRoot(), 'test_data/temp')
    await fs.mkdir(tempDir, { recursive: true })
    const tempCaptionsPath = path.join(tempDir, 'test-media-save.captions.json')
    const audioFilePath = path.join(getProjectRoot(), 'test_data/OSR_us_000_0010_8k.wav')

    const initialCaptions = JSON.stringify({
      metadata: { id: 'test-id-123' },
      segments: [{ id: 'test-segment-id', startTime: 0.0, endTime: 3.0, text: 'Test caption' }]
    })
    await fs.writeFile(tempCaptionsPath, initialCaptions, 'utf-8')

    // Load the captions JSON into the shared renderer store (sets document.filePath)
    await page.evaluate(({ content, filePath }) => {
      const store = (window as any).$store
      store.loadFromFile(content, filePath)
    }, { content: initialCaptions, filePath: tempCaptionsPath })

    // Load a media file
    await page.evaluate(async (audioPath) => {
      const store = (window as any).$store
      const electronAPI = (window as any).electronAPI

      // Convert file to URL and load it
      const result = await electronAPI.fileToURL(audioPath)
      if (result.success) {
        store.loadMediaFile(result.url, audioPath)
      }
    }, audioFilePath)

    await page.waitForFunction(() => {
      const store = (window as any).$store
      return !!store?.mediaPath && !!store?.mediaFilePath
    }, { timeout: 5000 })

    // Verify media was loaded in the store
    const mediaState = await page.evaluate(() => {
      const store = (window as any).$store
      return {
        mediaPath: store?.mediaPath,
        mediaFilePath: store?.mediaFilePath
      }
    })
    console.log('Media state:', mediaState)
    expect(mediaState.mediaPath).toBeTruthy()
    expect(mediaState.mediaFilePath).toBe(audioFilePath)

    // Export the captions content to see what would be saved
    const exportedContent = await page.evaluate(() => {
      const store = (window as any).$store
      return store.exportToString()
    })

    console.log('Exported captions content:')
    console.log(exportedContent)

    const exported = JSON.parse(exportedContent)
    expect(exported.metadata.mediaFilePath).toBeTruthy()
    expect(String(exported.metadata.mediaFilePath)).toContain('OSR_us_000_0010_8k.wav')

    // Clean up
    await fs.unlink(tempCaptionsPath)
    await fs.rmdir(tempDir).catch(() => { }) // Ignore error if not empty
  })
})
