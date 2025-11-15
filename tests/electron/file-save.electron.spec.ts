import { test, expect, _electron as electron } from '@playwright/test'
import { ElectronApplication, Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs/promises'
import { fileURLToPath } from 'url'
import { enableConsoleCapture } from '../helpers/console'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test.describe('File Save - Save VTT files correctly', () => {
  let electronApp: ElectronApplication
  let window: Page

  test.afterEach(async () => {
    if (electronApp) {
      await electronApp.close()
    }
  })

  test('should include mediaFilePath in saved VTT metadata', async () => {
    // Create a temporary VTT file
    const tempDir = path.join(process.cwd(), 'test_data/temp')
    await fs.mkdir(tempDir, { recursive: true })
    const tempVttPath = path.join(tempDir, 'test-media-save.vtt')
    const audioFilePath = path.join(process.cwd(), 'test_data/OSR_us_000_0010_8k.wav')

    // Start with a simple VTT file
    const initialVtt = `WEBVTT

NOTE CAPTION_EDITOR:TranscriptMetadata {"id":"test-id-123"}

NOTE CAPTION_EDITOR:TranscriptSegment {"id":"test-cue-id","startTime":0.0,"endTime":3.0,"text":"Test caption"}

test-cue-id
00:00:00.000 --> 00:00:03.000
Test caption
`
    await fs.writeFile(tempVttPath, initialVtt, 'utf-8')

    // Launch Electron with the VTT file
    electronApp = await electron.launch({
      args: [
        path.join(process.cwd(), 'dist-electron/main.cjs'),
        '--no-sandbox',
        tempVttPath
      ],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DISPLAY: process.env.DISPLAY || ':99'
      }
    })

    window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    enableConsoleCapture(window)
    await window.waitForTimeout(2000)

    // Load a media file
    await window.evaluate(async (audioPath) => {
      const store = (window as any).$store
      const electronAPI = (window as any).electronAPI

      // Convert file to URL and load it
      const result = await electronAPI.fileToURL(audioPath)
      if (result.success) {
        store.loadMediaFile(result.url, audioPath)
      }
    }, audioFilePath)

    await window.waitForTimeout(1000)

    // Verify media was loaded in the store
    const mediaState = await window.evaluate(() => {
      const store = (window as any).$store
      return {
        mediaPath: store?.mediaPath,
        mediaFilePath: store?.mediaFilePath
      }
    })
    console.log('Media state:', mediaState)
    expect(mediaState.mediaPath).toBeTruthy()
    expect(mediaState.mediaFilePath).toBe(audioFilePath)

    // Export the VTT content to see what would be saved
    const exportedContent = await window.evaluate(() => {
      const store = (window as any).$store
      return store.exportToString()
    })

    console.log('Exported VTT content:')
    console.log(exportedContent)

    // THIS IS THE BUG: The exported content should include mediaFilePath in metadata
    // but it doesn't because the store's mediaFilePath is separate from document.metadata

    // Verify the exported content contains mediaFilePath
    expect(exportedContent).toContain('CAPTION_EDITOR:TranscriptMetadata')

    // Parse the metadata to check if mediaFilePath is included
    const metadataMatch = exportedContent.match(/NOTE CAPTION_EDITOR:TranscriptMetadata ({.*?})\n/s)
    expect(metadataMatch).toBeTruthy()

    if (metadataMatch) {
      const metadata = JSON.parse(metadataMatch[1])
      console.log('Parsed metadata:', metadata)

      // This will FAIL because mediaFilePath is not being included in the export
      expect(metadata.mediaFilePath).toBeTruthy()
      expect(metadata.mediaFilePath).toContain('OSR_us_000_0010_8k.wav')
    }

    // Clean up
    await fs.unlink(tempVttPath)
    await fs.rmdir(tempDir).catch(() => {}) // Ignore error if not empty
  })
})
