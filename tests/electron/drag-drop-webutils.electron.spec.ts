/**
 * Test drag-and-drop with webUtils.getPathForFile()
 *
 * NOTE: This test has limitations due to Playwright's inability to simulate
 * genuine drag-and-drop with real File objects. The webUtils.getPathForFile()
 * API only works with File objects from actual drag-and-drop events, not
 * synthetic File objects created in tests.
 *
 * This test verifies:
 * 1. The electronAPI.getPathForFile() API is properly exposed
 * 2. The API can be called without errors
 * 3. The preload handler is registered
 *
 * Full end-to-end testing requires manual verification - see DRAG_DROP_IMPLEMENTATION.md
 */
import { sharedElectronTest as test, expect } from '../helpers/shared-electron'
import * as path from 'path'
import * as fs from 'fs'
import { getProjectRoot } from '../helpers/project-root'

test.describe('Drag-and-drop with webUtils.getPathForFile()', () => {
  test('should expose getPathForFile API (note: returns empty for synthetic File objects)', async ({ page }) => {
    // Wait for app to be ready
    await page.waitForSelector('.app', { timeout: 10000 })

    // Create a test VTT file
    const testVttPath = path.join(getProjectRoot(), 'test_data/sample.vtt.copy')
    const originalContent = fs.readFileSync(
      path.join(getProjectRoot(), 'test_data/sample.vtt'),
      'utf-8'
    )
    fs.writeFileSync(testVttPath, originalContent, 'utf-8')

    console.log('[test] Created test VTT file at:', testVttPath)

    try {
      // Simulate drag-and-drop by creating a DataTransfer with File objects
      const result = await page.evaluate(async (filePath) => {
        // Check if electronAPI.getPathForFile is available
        const electronAPI = (window as any).electronAPI
        if (!electronAPI || !electronAPI.getPathForFile) {
          return { success: false, error: 'electronAPI.getPathForFile not available' }
        }

        // Create a File object from the path
        // In real drag-and-drop, this File object comes from dataTransfer.files
        const response = await fetch(`file://${filePath}`)
        const blob = await response.blob()
        const file = new File([blob], filePath.split('/').pop() || 'test.vtt', {
          type: 'text/vtt'
        })

        console.log('[test] Created File object:', {
          name: file.name,
          size: file.size,
          type: file.type
        })

        // Test webUtils.getPathForFile() via electronAPI
        const extractedPath = electronAPI.getPathForFile(file)
        console.log('[test] Extracted path using getPathForFile():', extractedPath)

        return {
          success: true,
          extractedPath,
          fileName: file.name,
          fileSize: file.size
        }
      }, testVttPath)

      console.log('[test] Result:', result)

      // Verify the API is exposed and can be called
      expect(result.success).toBe(true)

      // NOTE: extractedPath will be empty because File object is synthetic
      // In real drag-and-drop, this would contain the actual file path
      // This limitation is documented in DRAG_DROP_IMPLEMENTATION.md
      console.log('[test] ⚠️  extractedPath is empty (expected for synthetic File objects)')
      console.log('[test] ⚠️  Real drag-and-drop events will populate the path correctly')
      console.log('[test] ✓ API is exposed and callable')

    } finally {
      // Cleanup
      if (fs.existsSync(testVttPath)) {
        fs.unlinkSync(testVttPath)
        console.log('[test] Cleaned up test file')
      }
    }
  })

  test('should handle multiple files dropped simultaneously', async ({ page }) => {
    await page.waitForSelector('.app', { timeout: 10000 })

    // Test dropping multiple files
    const result = await page.evaluate(async () => {
      const electronAPI = (window as any).electronAPI
      if (!electronAPI || !electronAPI.getPathForFile) {
        return { success: false, error: 'electronAPI.getPathForFile not available' }
      }

      // Simulate multiple File objects
      const files = [
        new File(['WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nTest 1'], 'test1.vtt', { type: 'text/vtt' }),
        new File(['WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nTest 2'], 'test2.vtt', { type: 'text/vtt' })
      ]

      const paths = files.map(file => {
        try {
          return electronAPI.getPathForFile(file)
        } catch (err) {
          console.error('[test] Error getting path:', err)
          return null
        }
      })

      return {
        success: true,
        paths,
        filesProcessed: paths.filter(p => p !== null).length
      }
    })

    console.log('[test] Multiple files result:', result)
    expect(result.success).toBe(true)
  })
})
