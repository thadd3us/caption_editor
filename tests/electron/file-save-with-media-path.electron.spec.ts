import { sharedElectronTest as test, expect } from '../helpers/shared-electron'
import type { Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs/promises'
import { getProjectRoot } from '../helpers/project-root'

test.describe('File Save with Media Path - Relative path updates', () => {
  let window: Page
  let tempDir: string
  let testCaptionsPath: string
  let mediaFilePath: string
  let subdirPath: string
  let saveAsPath: string

  test.beforeEach(async () => {
    // Create a temporary directory structure:
    // temp-media-test/
    //   ├── test.captions.json (original captions file)
    //   ├── audio.wav (media file in same directory)
    //   └── subdir/
    //       └── saved.captions.json (save-as location)

    tempDir = path.join(getProjectRoot(), 'test_data/temp-media-test')
    await fs.mkdir(tempDir, { recursive: true })

    subdirPath = path.join(tempDir, 'subdir')
    await fs.mkdir(subdirPath, { recursive: true })

    testCaptionsPath = path.join(tempDir, 'test.captions.json')
    mediaFilePath = path.join(tempDir, 'audio.wav')
    saveAsPath = path.join(subdirPath, 'saved.captions.json')

    // Copy media file to temp directory
    const sourceMedia = path.join(getProjectRoot(), 'test_data/OSR_us_000_0010_8k.wav')
    await fs.copyFile(sourceMedia, mediaFilePath)

    // Create captions file with media reference (just filename since they're in same directory)
    const initialCaptions = {
      metadata: { id: 'test-doc-123', mediaFilePath: 'audio.wav' },
      segments: [
        { id: 'segment-1', startTime: 1.0, endTime: 4.0, text: 'First caption' },
        { id: 'segment-2', startTime: 5.0, endTime: 8.0, text: 'Second caption' }
      ]
    }
    await fs.writeFile(testCaptionsPath, JSON.stringify(initialCaptions, null, 2), 'utf-8')
  })

  test.afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch (err) {
      console.warn('Failed to clean up temp directory:', err)
    }
  })

  test('should update media file relative path when saving to subdirectory', async ({ page }) => {
    window = page
    console.log('Test setup:')
    console.log('  Captions file:', testCaptionsPath)
    console.log('  Media file:', mediaFilePath)
    console.log('  Save-as path:', saveAsPath)
    console.log('  Original mediaFilePath:', 'audio.wav')
    console.log('  Expected mediaFilePath after save-as:', '../audio.wav')

    // Step 1: Load the captions file into the store with filePath set (so paths resolve)
    const initialCaptions = await fs.readFile(testCaptionsPath, 'utf-8')
    await window.evaluate(({ content, filePath }) => {
      const store = (window as any).$store
      store.loadFromFile(content, filePath)
    }, { content: initialCaptions, filePath: testCaptionsPath })

    // Step 2: Verify the captions file loaded with media reference
    const initialState = await window.evaluate(() => {
      const store = (window as any).$store
      return {
        filePath: store.document.filePath,
        mediaFilePath: store.mediaFilePath,
        metadata: store.document.metadata
      }
    })

    console.log('Initial state:', initialState)
    expect(initialState.filePath).toBe(testCaptionsPath)
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

    console.log('\nExported captions content:')
    console.log(exportedContent)

    // Step 5: Save the content
    await fs.writeFile(saveAsPath, exportedContent, 'utf-8')

    // Step 6: Parse the saved file and check the mediaFilePath
    const savedContent = await fs.readFile(saveAsPath, 'utf-8')

    const savedDoc = JSON.parse(savedContent)
    console.log('\nParsed metadata from saved file:', savedDoc.metadata)
    console.log('  mediaFilePath:', savedDoc.metadata.mediaFilePath)

    // THIS IS THE KEY ASSERTION:
    // When saving from temp-media-test/test.captions.json to temp-media-test/subdir/saved.captions.json,
    // the media file at temp-media-test/audio.wav should now be referenced as ../audio.wav
    expect(savedDoc.metadata.mediaFilePath).toBe('../audio.wav')
    console.log('✓ Media path correctly updated to relative path from new location!')

    // Step 7: Verify we can compute the absolute path from the relative path
    const savedCaptionsDir = path.dirname(saveAsPath)
    const computedAbsolutePath = path.resolve(savedCaptionsDir, '../audio.wav')
    console.log('\nVerification:')
    console.log('  Saved captions directory:', savedCaptionsDir)
    console.log('  Relative path in captions JSON:', '../audio.wav')
    console.log('  Computed absolute path:', computedAbsolutePath)
    console.log('  Expected absolute path:', mediaFilePath)

    expect(computedAbsolutePath).toBe(mediaFilePath)
    console.log('✓ Relative path resolves to correct absolute media file location!')
  })
})
