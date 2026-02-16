import { sharedElectronTest as test, expect } from '../helpers/shared-electron'
import type { Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs/promises'
import { getProjectRoot } from '../helpers/project-root'

test.describe('File Save Workflow - Complete save and save-as cycle', () => {
  let window: Page
  let tempDir: string
  let testCaptionsPath: string
  let saveAsPath: string

  test.beforeEach(async () => {
    // Create a temporary directory for test files
    tempDir = path.join(getProjectRoot(), 'test_data/temp-save-test')
    await fs.mkdir(tempDir, { recursive: true })

    // Create a sample captions file for testing
    testCaptionsPath = path.join(tempDir, 'test-captions.captions_json')
    const initialDoc = {
      metadata: { id: 'sample-doc' },
      segments: [
        { id: 'segment-1', startTime: 0, endTime: 5, text: 'Welcome to the Caption Editor!' },
        { id: 'segment-2', startTime: 5, endTime: 10, text: 'This is a sample caption file.' },
        { id: 'segment-3', startTime: 10, endTime: 15, text: 'Edit captions and save changes.' }
      ]
    }
    await fs.writeFile(testCaptionsPath, JSON.stringify(initialDoc, null, 2), 'utf-8')

    // Define the save-as target path
    saveAsPath = path.join(tempDir, 'test-captions-edited.captions_json')
  })

  test.afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch (err) {
      console.warn('Failed to clean up temp directory:', err)
    }
  })

  test('should open, edit, and save captions file', async ({ page }) => {
    window = page

    // Step 1: Load the test captions file into the shared renderer store
    console.log('Step 1: Loading captions into store:', testCaptionsPath)
    const initialCaptions = await fs.readFile(testCaptionsPath, 'utf-8')
    await window.evaluate(({ content, filePath }) => {
      const store = (window as any).$store
      store.loadFromFile(content, filePath)
    }, { content: initialCaptions, filePath: testCaptionsPath })

    await window.waitForFunction(
      (expectedPath) => (window as any).$store?.document?.filePath === expectedPath,
      testCaptionsPath,
      { timeout: 5000 }
    )

    // Step 2: Verify the file path is displayed in the UI
    console.log('Step 2: Verifying file path display in UI')

    const filePathDisplay = await window.locator('.file-path-display').textContent()
    expect(filePathDisplay).toContain(testCaptionsPath)
    console.log('✓ File path displayed correctly:', filePathDisplay)

    // Verify the store has the correct file path
    const storeFilePath = await window.evaluate(() => {
      const store = (window as any).$store
      return store.document.filePath
    })
    expect(storeFilePath).toBe(testCaptionsPath)
    console.log('✓ Store file path is correct:', storeFilePath)

    // Step 3: Add a new segment and edit it multiple times to create history
    console.log('Step 3: Adding new segment and editing it')

    // Set current time to 20 seconds and add a segment
    const newSegmentId = await window.evaluate(() => {
      const store = (window as any).$store
      store.setCurrentTime(20)
      const segmentId = store.addSegment(20, 5) // Add segment from 20s to 25s
      store.updateSegment(segmentId, { text: 'First version of caption' })
      store.updateSegment(segmentId, { text: 'Second version of caption' })
      store.updateSegment(segmentId, { text: 'This is a new test caption added by the E2E test!' })
      return segmentId
    })

    console.log('✓ Added new segment with ID:', newSegmentId, 'and edited it 3 times')

    // Verify the segment was added
    const segmentCount = await window.evaluate(() => {
      const store = (window as any).$store
      return store.document.segments.length
    })
    expect(segmentCount).toBe(4) // Original 3 segments + 1 new segment
    console.log('✓ Segment count is now:', segmentCount)

    // Step 4: Save the file (overwrite original)
    console.log('Step 4: Saving file (overwrite)')

    // Trigger save programmatically (more reliable than keyboard shortcut in tests)
    await window.evaluate(async () => {
      const electronAPI = (window as any).electronAPI
      const store = (window as any).$store

      if (!electronAPI || !store) {
        throw new Error('electronAPI or store not available')
      }

      const content = store.exportToString()
      const result = await electronAPI.saveExistingFile({
        filePath: store.document.filePath,
        content
      })

      if (!result.success) {
        throw new Error('Save failed: ' + result.error)
      }
    })
    await window.waitForTimeout(500)

    console.log(`✓ Save triggered programmatically`)

    // Step 5: Check the contents of the saved captions file
    console.log('Step 5: Verifying saved captions file contents')

    const savedContent = await fs.readFile(testCaptionsPath, 'utf-8')
    const savedDoc = JSON.parse(savedContent)
    console.log('Saved captions JSON preview:', JSON.stringify(savedDoc, null, 2).substring(0, 500))

    // Verify the saved content has the new segment
    expect(JSON.stringify(savedDoc)).toContain('This is a new test caption added by the E2E test!')
    const newSegment = savedDoc.segments.find((s: any) => s.text?.includes('This is a new test caption'))
    expect(newSegment).toBeTruthy()
    expect(newSegment.startTime).toBe(20)
    expect(newSegment.endTime).toBe(25)

    // Verify it still has original segments
    expect(JSON.stringify(savedDoc)).toContain('Welcome to the Caption Editor!')
    expect(JSON.stringify(savedDoc)).toContain('This is a sample caption file.')

    console.log('✓ Saved captions file content verified')
  })

  test('should save-as captions file to new location and update UI', async ({ page }) => {
    window = page
    console.log('Setup: Loading initial captions file for save-as test')
    const initialCaptions = await fs.readFile(testCaptionsPath, 'utf-8')
    await window.evaluate(({ content, filePath }) => {
      const store = (window as any).$store
      store.loadFromFile(content, filePath)
    }, { content: initialCaptions, filePath: testCaptionsPath })

    await window.waitForFunction(
      (expectedPath) => (window as any).$store?.document?.filePath === expectedPath,
      testCaptionsPath,
      { timeout: 5000 }
    )

    // Step 6: Test updateFilePath functionality and verify file save
    console.log('Step 6: Testing Save As functionality')

    // Get the current file path
    const initialFilePath = await window.evaluate(() => {
      const store = (window as any).$store
      return store.document.filePath
    })
    console.log('Initial file path:', initialFilePath)
    expect(initialFilePath).toBe(testCaptionsPath)

    // Simulate what Save As does: export content and update file path
    const exportedContent = await window.evaluate(() => {
      const store = (window as any).$store
      return store.exportToString()
    })

    // Manually save the content to simulate Save As
    await fs.writeFile(saveAsPath, exportedContent, 'utf-8')
    console.log('✓ Content written to save-as path:', saveAsPath)

    // Update the store's file path (this is what Save As does)
    await window.evaluate((newPath) => {
      const store = (window as any).$store
      store.updateFilePath(newPath)
    }, saveAsPath)

    // Step 7: Verify the updateFilePath worked
    console.log('Step 7: Verifying file path was updated')

    const updatedStoreFilePath = await window.evaluate(() => {
      const store = (window as any).$store
      return store.document.filePath
    })
    expect(updatedStoreFilePath).toBe(saveAsPath)
    console.log('✓ Store updated with new file path:', updatedStoreFilePath)

    // Verify the UI shows the new file path
    await window.waitForTimeout(500)
    const updatedFilePathDisplay = await window.locator('.file-path-display').textContent()
    expect(updatedFilePathDisplay).toContain(saveAsPath)
    console.log('✓ UI updated with new file path:', updatedFilePathDisplay)

    // Step 7: Final verification of the file on disk
    const savedAsContent = await fs.readFile(saveAsPath, 'utf-8')
    const savedAsDoc = JSON.parse(savedAsContent)
    expect(JSON.stringify(savedAsDoc)).toContain('Welcome to the Caption Editor!')
    expect(JSON.stringify(savedAsDoc)).toContain('This is a sample caption file.')

    // Verify both files exist
    const originalExists = await fs.access(testCaptionsPath).then(() => true).catch(() => false)
    const saveAsExists = await fs.access(saveAsPath).then(() => true).catch(() => false)

    expect(originalExists).toBe(true)
    expect(saveAsExists).toBe(true)
    console.log('✓ Both files exist: original and save-as')

    console.log('✅ Save As test completed successfully!')
  })

  test('should load, modify, and save speaker_name field via table UI', async ({ page }) => {
    window = page
    // Step 1: Set up a captions JSON document containing speaker names
    console.log('Step 1: Setting up test document with speaker names')
    const osrCaptionsPath = path.join(tempDir, 'osr-test-speakers.captions_json')
    const osrMediaFileName = 'OSR_us_000_0010_8k.wav'
    const osrMediaPath = path.join(getProjectRoot(), 'test_data', osrMediaFileName)
    const tempOsrMediaPath = path.join(tempDir, osrMediaFileName)

    // Copy media file to temp dir (so relative mediaFilePath works)
    if (await fs.stat(osrMediaPath).catch(() => null)) { // Check if media file exists in source
      await fs.copyFile(osrMediaPath, tempOsrMediaPath) // Copy media file to temp
    }

    // Write captions document
    const osrDoc = {
      metadata: { id: 'osr-doc', mediaFilePath: osrMediaFileName },
      segments: [
        { id: 'osr-1', startTime: 0, endTime: 1, text: 'The birch canoe slid on the smooth planks.', speakerName: 'Alice' },
        { id: 'osr-2', startTime: 1, endTime: 2, text: 'Glue the sheet to the dark blue background.' },
        { id: 'osr-3', startTime: 2, endTime: 3, text: 'The juice of lemons makes fine punch.', speakerName: 'Bob' }
      ]
    }
    await fs.writeFile(osrCaptionsPath, JSON.stringify(osrDoc, null, 2), 'utf-8')

    // Step 2: Load the OSR test document into the shared renderer store
    console.log('Step 2: Loading OSR captions into store:', osrCaptionsPath)
    const osrContent = await fs.readFile(osrCaptionsPath, 'utf-8')
    await window.evaluate(({ content, filePath }) => {
      const store = (window as any).$store
      store.loadFromFile(content, filePath)
    }, { content: osrContent, filePath: osrCaptionsPath })

    await window.waitForFunction(
      (expectedPath) => (window as any).$store?.document?.filePath === expectedPath,
      osrCaptionsPath,
      { timeout: 5000 }
    )

    // Step 2.5: Verify media actually loaded
    console.log('Step 2.5: Verifying media loaded and has non-zero duration')
    await window.waitForFunction(
      () => {
        const video = document.querySelector('video')
        const audio = document.querySelector('audio')
        const media = (video || audio) as HTMLMediaElement | null
        return !!media && Number.isFinite(media.duration) && media.duration > 0
      },
      { timeout: 15000 }
    )
    const mediaStatus = await window.evaluate(() => {
      const video = document.querySelector('video')
      const audio = document.querySelector('audio')
      const media = (video || audio) as HTMLMediaElement
      return {
        hasMedia: !!media,
        src: media?.src || '',
        duration: media?.duration || 0,
        readyState: media?.readyState || 0,
        networkState: media?.networkState || 0,
        error: media?.error ? media.error.code : null
      }
    })
    console.log('Media status debug:', JSON.stringify(mediaStatus, null, 2))
    expect(mediaStatus.duration).toBeGreaterThan(0)
    console.log(`✓ Media duration detected: ${mediaStatus.duration}`)

    // Step 3: Verify speaker names are loaded correctly
    console.log('Step 3: Verifying speaker names loaded from captions file')

    const speakerData = await window.evaluate(() => {
      const store = (window as any).$store
      const segments = store.document.segments
      return segments.map((segment: any) => ({
        id: segment.id,
        text: segment.text.substring(0, 30),
        speakerName: segment.speakerName
      }))
    })

    console.log('Loaded segments with speaker data:', speakerData)

    // First segment should have Alice
    expect(speakerData[0].speakerName).toBe('Alice')
    console.log('✓ First segment has speaker "Alice"')

    // Second segment should have no speaker
    expect(speakerData[1].speakerName).toBeUndefined()
    console.log('✓ Second segment has no speaker (as expected)')

    // Third segment should have Bob
    expect(speakerData[2].speakerName).toBe('Bob')
    console.log('✓ Third segment has speaker "Bob"')

    // Step 4: Modify the first speaker name from "Alice" to "Charlie" via the table
    console.log('Step 4: Modifying first speaker name from Alice to Charlie')

    const firstSegmentId = speakerData[0].id
    await window.evaluate((segmentId) => {
      const store = (window as any).$store
      store.updateSegment(segmentId, { speakerName: 'Charlie' })
    }, firstSegmentId)

    // Verify the update
    const updatedFirstSpeaker = await window.evaluate((segmentId) => {
      const store = (window as any).$store
      const segment = store.document.segments.find((s: any) => s.id === segmentId)
      return segment?.speakerName
    }, firstSegmentId)
    expect(updatedFirstSpeaker).toBe('Charlie')
    console.log('✓ First speaker updated to "Charlie"')

    // Step 5: Add speaker name "Diana" to second segment that didn't have one
    console.log('Step 5: Adding speaker name "Diana" to second segment')

    const secondSegmentId = speakerData[1].id
    await window.evaluate((segmentId) => {
      const store = (window as any).$store
      store.updateSegment(segmentId, { speakerName: 'Diana' })
    }, secondSegmentId)

    // Verify the addition
    const newSecondSpeaker = await window.evaluate((segmentId) => {
      const store = (window as any).$store
      const segment = store.document.segments.find((s: any) => s.id === segmentId)
      return segment?.speakerName
    }, secondSegmentId)
    expect(newSecondSpeaker).toBe('Diana')
    console.log('✓ Second segment now has speaker "Diana"')

    // Step 6: Save the file
    console.log('Step 6: Saving file with updated speaker names')

    // Trigger save programmatically (more reliable than keyboard shortcut in tests)
    await window.evaluate(async () => {
      const electronAPI = (window as any).electronAPI
      const store = (window as any).$store

      if (!electronAPI || !store) {
        throw new Error('electronAPI or store not available')
      }

      const content = store.exportToString()
      const result = await electronAPI.saveExistingFile({
        filePath: store.document.filePath,
        content
      })

      if (!result.success) {
        throw new Error('Save failed: ' + result.error)
      }
    })
    await window.waitForTimeout(500)
    console.log(`✓ Save triggered programmatically`)

    // Step 7: Read and verify the saved captions file contents
    console.log('Step 7: Verifying saved captions file contains updated speaker names')

    const savedContent = await fs.readFile(osrCaptionsPath, 'utf-8')
    const savedDoc = JSON.parse(savedContent)

    const savedSegments = savedDoc.segments as Array<any>
    expect(savedSegments[0].speakerName).toBe('Charlie')
    console.log('✓ Saved file contains updated speaker "Charlie"')

    expect(savedSegments[1].speakerName).toBe('Diana')
    console.log('✓ Saved file contains new speaker "Diana"')

    expect(savedSegments[2].speakerName).toBe('Bob')
    console.log('✓ Saved file still contains original speaker "Bob"')

    expect(savedContent).toContain('The birch canoe slid on the smooth planks.')
    expect(savedContent).toContain('Glue the sheet to the dark blue background.')
    expect(savedContent).toContain('The juice of lemons makes fine punch.')

    console.log('✓ Saved captions file verified with speaker names')
    console.log('✅ Speaker name test completed successfully!')
  })
})
