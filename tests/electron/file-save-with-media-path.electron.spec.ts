import { test, expect, _electron as electron } from '@playwright/test'
import { ElectronApplication, Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs/promises'
import { fileURLToPath } from 'url'
import { enableConsoleCapture } from '../helpers/console'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test.describe('File Save with Media Path - Relative path updates', () => {
  let electronApp: ElectronApplication
  let window: Page
  let tempDir: string
  let testVttPath: string
  let mediaFilePath: string
  let subdirPath: string
  let saveAsPath: string

  test.beforeEach(async () => {
    // Create a temporary directory structure:
    // temp-media-test/
    //   ├── test.vtt (original VTT file)
    //   ├── audio.wav (media file in same directory)
    //   └── subdir/
    //       └── saved.vtt (save-as location)

    tempDir = path.join(process.cwd(), 'test_data/temp-media-test')
    await fs.mkdir(tempDir, { recursive: true })

    subdirPath = path.join(tempDir, 'subdir')
    await fs.mkdir(subdirPath, { recursive: true })

    testVttPath = path.join(tempDir, 'test.vtt')
    mediaFilePath = path.join(tempDir, 'audio.wav')
    saveAsPath = path.join(subdirPath, 'saved.vtt')

    // Copy media file to temp directory
    const sourceMedia = path.join(process.cwd(), 'test_data/OSR_us_000_0010_8k.wav')
    await fs.copyFile(sourceMedia, mediaFilePath)

    // Create VTT file with media reference (just filename since they're in same directory)
    const initialVtt = `WEBVTT

NOTE CAPTION_EDITOR:TranscriptMetadata {"id":"test-doc-123","mediaFilePath":"audio.wav"}

NOTE CAPTION_EDITOR:VTTCueMetadata {"id":"cue-1"}

cue-1
00:00:01.000 --> 00:00:04.000
First caption

NOTE CAPTION_EDITOR:VTTCueMetadata {"id":"cue-2"}

cue-2
00:00:05.000 --> 00:00:08.000
Second caption
`
    await fs.writeFile(testVttPath, initialVtt, 'utf-8')
  })

  test.afterEach(async () => {
    if (electronApp) {
      await electronApp.close()
    }

    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch (err) {
      console.warn('Failed to clean up temp directory:', err)
    }
  })

  test('should update media file relative path when saving to subdirectory', async () => {
    console.log('Test setup:')
    console.log('  VTT file:', testVttPath)
    console.log('  Media file:', mediaFilePath)
    console.log('  Save-as path:', saveAsPath)
    console.log('  Original mediaFilePath in VTT:', 'audio.wav')
    console.log('  Expected mediaFilePath after save-as:', '../audio.wav')

    // Step 1: Launch Electron with the VTT file
    electronApp = await electron.launch({
      args: [
        path.join(process.cwd(), 'dist-electron/main.cjs'),
        '--no-sandbox',
        testVttPath
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

    // Wait for the VTT file to be loaded (check that document.filePath is set)
    await window.waitForFunction(
      () => {
        const store = (window as any).$store
        return store?.document?.filePath !== undefined
      },
      { timeout: 5000 }
    )

    // Step 2: Verify the VTT file loaded with media reference
    const initialState = await window.evaluate(() => {
      const store = (window as any).$store
      return {
        filePath: store.document.filePath,
        mediaFilePath: store.mediaFilePath,
        metadata: store.document.metadata
      }
    })

    console.log('Initial state:', initialState)
    expect(initialState.filePath).toBe(testVttPath)
    // Media path is now stored as absolute path internally
    expect(initialState.mediaFilePath).toBe(mediaFilePath)
    expect(initialState.metadata.mediaFilePath).toBe(mediaFilePath)

    // Step 3: Simulate Save As to subdirectory
    console.log('\nStep 3: Simulating Save As to subdirectory')

    // First, update the file path in the store (this is what Save As does)
    await window.evaluate((newPath) => {
      const store = (window as any).$store
      store.updateFilePath(newPath)
    }, saveAsPath)

    // Step 4: Export the content (this should recompute the relative media path)
    const exportedContent = await window.evaluate(() => {
      const store = (window as any).$store
      return store.exportToString()
    })

    console.log('\nExported VTT content:')
    console.log(exportedContent)

    // Step 5: Save the content
    await fs.writeFile(saveAsPath, exportedContent, 'utf-8')

    // Step 6: Parse the saved file and check the mediaFilePath
    const savedContent = await fs.readFile(saveAsPath, 'utf-8')

    // Extract the metadata line
    const metadataMatch = savedContent.match(/NOTE CAPTION_EDITOR:TranscriptMetadata ({.*?})\n/s)
    expect(metadataMatch).toBeTruthy()

    if (metadataMatch) {
      const metadata = JSON.parse(metadataMatch[1])
      console.log('\nParsed metadata from saved file:', metadata)
      console.log('  mediaFilePath:', metadata.mediaFilePath)

      // THIS IS THE KEY ASSERTION:
      // When saving from temp-media-test/test.vtt to temp-media-test/subdir/saved.vtt,
      // the media file at temp-media-test/audio.wav should now be referenced as ../audio.wav
      expect(metadata.mediaFilePath).toBe('../audio.wav')
      console.log('✓ Media path correctly updated to relative path from new location!')
    }

    // Step 7: Verify we can compute the absolute path from the relative path
    const savedVttDir = path.dirname(saveAsPath)
    const computedAbsolutePath = path.resolve(savedVttDir, '../audio.wav')
    console.log('\nVerification:')
    console.log('  Saved VTT directory:', savedVttDir)
    console.log('  Relative path in VTT:', '../audio.wav')
    console.log('  Computed absolute path:', computedAbsolutePath)
    console.log('  Expected absolute path:', mediaFilePath)

    expect(computedAbsolutePath).toBe(mediaFilePath)
    console.log('✓ Relative path resolves to correct absolute media file location!')
  })
})
