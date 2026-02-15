import { sharedElectronTest as test, expect } from '../helpers/shared-electron'
import * as path from 'path'
import * as fs from 'fs/promises'
import { getProjectRoot } from '../helpers/project-root'

test.describe('Electron Media Auto-loading', () => {
  // Using shared Electron instance - no beforeEach/afterEach needed

  test('should auto-load media file when captions file has mediaFilePath metadata', async ({ page }) => {
    test.setTimeout(30000)

    // Use the actual media fixture and a generated captions fixture
    const captionsPath = path.join(getProjectRoot(), 'test_data/with-media-reference.captions.json')
    const mediaPath = path.join(getProjectRoot(), 'test_data/OSR_us_000_0010_8k.wav')

    // Verify both files exist
    await fs.access(mediaPath)
    await fs.writeFile(
      captionsPath,
      JSON.stringify({
        metadata: { id: 'with-media-ref', mediaFilePath: 'OSR_us_000_0010_8k.wav' },
        segments: [
          { id: 'cue1', startTime: 0, endTime: 1, text: 'One' },
          { id: 'cue2', startTime: 1, endTime: 2, text: 'Two' },
          { id: 'cue3', startTime: 2, endTime: 3, text: 'Three' }
        ]
      }, null, 2),
      'utf-8'
    )

    console.log('[DEBUG] Starting test - captions path:', captionsPath)
    console.log('[DEBUG] Media path:', mediaPath)

    // Clear any previous state
    await page.evaluate(() => {
      const store = (window as any).$store
      if (store) {
        console.log('[DEBUG] Clearing previous state, current mediaPath:', store.mediaPath)
        store.reset()
        store.mediaPath = null
      }
    })
    await page.waitForTimeout(200)

    // Process the captions file through electronAPI (simulating a file drop)
    const result = await page.evaluate(async (filePath) => {
      console.log('[DEBUG] Processing captions file:', filePath)
      if (!window.electronAPI) {
        console.log('[DEBUG] No electronAPI!')
        return null
      }
      const results = await window.electronAPI.processDroppedFiles([filePath])
      console.log('[DEBUG] processDroppedFiles results:', JSON.stringify(results))

      // Simulate the FileDropZone component processing the results
      const store = (window as any).$store
      if (!store) {
        console.log('[DEBUG] No store!')
        return null
      }

      for (const res of results) {
        if (res.type === 'captions_json' && res.content) {
          console.log('[DEBUG] Loading captions content, length:', res.content.length)
          store.loadFromFile(res.content, res.filePath)
        }
      }

      // Return the store state after loading
      return {
        segmentCount: store.document.segments.length,
        metadata: store.document.metadata,
        mediaPath: store.mediaPath,
        mediaFilePath: store.mediaFilePath
      }
    }, captionsPath)

    console.log('[DEBUG] After captions load:', result)

    // Verify captions file was loaded
    expect(result).toBeTruthy()
    expect(result!.segmentCount).toBe(3)
    // Media path should be converted to absolute path internally
    expect(result!.metadata.mediaFilePath).toBe(mediaPath)

    // Wait for auto-load to happen (App.vue handles this via watch)
    // Poll instead of fixed timeout to catch timing issues
    let finalState: any = null
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(100)
      finalState = await page.evaluate(() => {
        const store = (window as any).$store
        return {
          mediaPath: store.mediaPath,
          mediaFilePath: store.mediaFilePath,
          hasAudio: !!document.querySelector('audio')
        }
      })
      console.log(`[DEBUG] Poll ${i + 1}: mediaPath=${finalState.mediaPath}, hasAudio=${finalState.hasAudio}`)
      if (finalState.mediaPath) break
    }

    console.log('[DEBUG] Final state:', finalState)

    expect(finalState.mediaPath).toBeTruthy()
    expect(finalState.mediaPath).toContain('OSR_us_000_0010_8k.wav')
    expect(finalState.hasAudio).toBe(true)

    // Clean up generated fixture
    await fs.unlink(captionsPath).catch(() => {})
  })

  test('should handle missing media file gracefully', async ({ page }) => {
    test.setTimeout(30000)

    // Clear any previous state by loading an empty document and clearing media
    await page.evaluate(() => {
      const store = (window as any).$store
      if (store) {
        // Reset state
        store.reset()
        // Clear media path manually
        store.mediaPath = null
      }
    })
    await page.waitForTimeout(200)

    // Create a captions file with a non-existent media reference
    const testCaptionsPath = path.join(getProjectRoot(), 'test_data/missing-media-ref.captions.json')
    const captionsContent = JSON.stringify({
      metadata: { id: 'missing-media', mediaFilePath: 'nonexistent-file.wav' },
      segments: [{ id: 'cue1', startTime: 0, endTime: 3, text: 'Test caption' }]
    }, null, 2)

    await fs.mkdir(path.join(getProjectRoot(), 'test_data'), { recursive: true })
    await fs.writeFile(testCaptionsPath, captionsContent)

    // Load the captions file
    await page.evaluate(async (filePath) => {
      if (!window.electronAPI) return
      const results = await window.electronAPI.processDroppedFiles([filePath])

      const store = (window as any).$store
      for (const res of results) {
        if (res.type === 'captions_json' && res.content) {
          store.loadFromFile(res.content, res.filePath)
        }
      }
    }, testCaptionsPath)

    // Wait for auto-load attempt (App.vue handles this, should fail gracefully)
    await page.waitForTimeout(500)

    // Verify media was NOT loaded
    const state = await page.evaluate(() => {
      const store = (window as any).$store
      return {
        mediaPath: store.mediaPath,
        segmentCount: store.document.segments.length,
        hasMetadata: !!store.document.metadata.mediaFilePath
      }
    })

    expect(state.segmentCount).toBe(1)
    expect(state.hasMetadata).toBe(true)
    expect(state.mediaPath).toBeFalsy() // Should not have loaded any media

    // Clean up
    await fs.unlink(testCaptionsPath).catch(() => {})
  })

  test('should not auto-load if media is already loaded', async ({ page }) => {
    test.setTimeout(30000)

    // First, manually load a media file
    const mediaPath = path.join(getProjectRoot(), 'test_data/OSR_us_000_0010_8k.wav')

    await page.evaluate(async (filePath) => {
      if (!window.electronAPI) return
      const results = await window.electronAPI.processDroppedFiles([filePath])

      const store = (window as any).$store
      for (const res of results) {
        if (res.type === 'media' && res.url) {
          store.loadMediaFile(res.url, res.filePath)
        }
      }
    }, mediaPath)

    await page.waitForTimeout(500)

    const initialMediaPath = await page.evaluate(() => {
      const store = (window as any).$store
      return store.mediaPath
    })

    console.log('Initial media path:', initialMediaPath)
    expect(initialMediaPath).toBeTruthy()

    // Now load captions file with media reference
    const captionsPath = path.join(getProjectRoot(), 'test_data/with-media-reference.captions.json')
    await fs.writeFile(
      captionsPath,
      JSON.stringify({
        metadata: { id: 'with-media-ref-2', mediaFilePath: 'OSR_us_000_0010_8k.wav' },
        segments: [{ id: 'cue1', startTime: 0, endTime: 1, text: 'One' }]
      }, null, 2),
      'utf-8'
    )

    await page.evaluate(async (filePath) => {
      if (!window.electronAPI) return
      const results = await window.electronAPI.processDroppedFiles([filePath])

      const store = (window as any).$store
      for (const res of results) {
        if (res.type === 'captions_json' && res.content) {
          store.loadFromFile(res.content, res.filePath)
        }
      }
    }, captionsPath)

    // Wait for any potential auto-load attempt (App.vue should skip since media is already loaded)
    await page.waitForTimeout(500)

    // Verify media path hasn't changed
    const finalMediaPath = await page.evaluate(() => {
      const store = (window as any).$store
      return store.mediaPath
    })

    console.log('Final media path:', finalMediaPath)
    expect(finalMediaPath).toBe(initialMediaPath)

    // Clean up generated fixture
    await fs.unlink(captionsPath).catch(() => {})
  })
})
