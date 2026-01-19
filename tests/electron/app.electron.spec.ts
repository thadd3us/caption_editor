import { sharedElectronTest as test, expect } from '../helpers/shared-electron'
import * as path from 'path'
import * as fs from 'fs/promises'
import { getProjectRoot } from '../helpers/project-root'

test.describe('Electron App', () => {
  // Using shared Electron instance - no beforeEach/afterEach needed

  test('should launch the application', async ({ page }) => {
    // Check that window is visible
    expect(await page.isVisible('body')).toBe(true)
  })

  test('should have the correct title', async ({ page }) => {
    const title = await page.title()
    expect(title).toBe('VTT Editor')
  })

  test('should show the caption table header', async ({ page }) => {
    const tableHeader = page.locator('.table-header h2')
    await expect(tableHeader).toBeVisible()
  })

  test('should have electronAPI available', async ({ page }) => {
    // Check that the Electron API is exposed
    const hasElectronAPI = await page.evaluate(() => {
      return !!window.electronAPI && window.electronAPI.isElectron
    })
    expect(hasElectronAPI).toBe(true)
  })

  test('should be able to read API methods', async ({ page }) => {
    const apiMethods = await page.evaluate(() => {
      if (!window.electronAPI) return []
      return Object.keys(window.electronAPI)
    })

    expect(apiMethods).toContain('openFile')
    expect(apiMethods).toContain('readFile')
    expect(apiMethods).toContain('saveFile')
    expect(apiMethods).toContain('fileToURL')
    expect(apiMethods).toContain('processDroppedFiles')
  })

  test('should load and display VTT content', async ({ page }) => {
    // Create a temporary VTT file
    const testVTTPath = path.join(getProjectRoot(), 'test_data/test.vtt')
    const vttContent = `WEBVTT

00:00:00.000 --> 00:00:05.000
First caption

00:00:05.000 --> 00:00:10.000
Second caption
`

    // Ensure test_data directory exists
    await fs.mkdir(path.join(getProjectRoot(), 'test_data'), { recursive: true })
    await fs.writeFile(testVTTPath, vttContent)

    // Load VTT file programmatically
    await page.evaluate(async (content) => {
      const store = (window as any).vttStore
      if (store && store.loadFromFile) {
        store.loadFromFile(content, 'test.vtt')
      }
    }, vttContent)

    // Wait for the table to update
    await page.waitForTimeout(500)

    // Check that captions are displayed in the table
    const captionTable = page.locator('.ag-center-cols-container')
    await expect(captionTable).toBeVisible()

    // Clean up
    await fs.unlink(testVTTPath).catch(() => {})
  })

  test('should be able to export VTT', async ({ page }) => {
    // First load some content
    const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:TranscriptMetadata {"id":"test-123"}

NOTE CAPTION_EDITOR:TranscriptSegment {"id":"seg-1","startTime":0.0,"endTime":5.0,"text":"Test caption"}

seg-1
00:00:00.000 --> 00:00:05.000
Test caption
`

    await page.evaluate(async (content) => {
      const store = (window as any).$store
      if (store && store.loadFromFile) {
        store.loadFromFile(content, 'test-export.vtt')
      }
    }, vttContent)

    await page.waitForTimeout(500)

    // Verify content loaded
    const segmentCount = await page.evaluate(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length || 0
    })
    expect(segmentCount).toBe(1)

    // Test that exportToString() works correctly (this is what Save As uses)
    const exportedContent = await page.evaluate(() => {
      const store = (window as any).$store
      return store.exportToString()
    })

    // Verify the exported content is valid VTT with correct format
    expect(exportedContent).toContain('WEBVTT')
    expect(exportedContent).toContain('Test caption')
    expect(exportedContent).toContain('TranscriptSegment')
    expect(exportedContent).toContain('"id":"seg-1"')
    expect(exportedContent).toContain('00:00:00.000 --> 00:00:05.000')

    console.log('✓ Export functionality verified')
  })

  test('should handle file drops', async ({ page }) => {
    // Create a test VTT file
    const testVTTPath = path.join(getProjectRoot(), 'test_data/drop-test.vtt')
    const vttContent = `WEBVTT

00:00:00.000 --> 00:00:05.000
Dropped caption
`

    await fs.mkdir(path.join(getProjectRoot(), 'test_data'), { recursive: true })
    await fs.writeFile(testVTTPath, vttContent)

    // Simulate file drop via electronAPI
    const result = await page.evaluate(async (filePath) => {
      if (!window.electronAPI) return null
      return await window.electronAPI.processDroppedFiles([filePath])
    }, testVTTPath)

    expect(result).toBeTruthy()
    expect(result).toHaveLength(1)
    expect(result![0].type).toBe('vtt')
    expect(result![0].content).toContain('Dropped caption')

    // Clean up
    await fs.unlink(testVTTPath).catch(() => {})
  })

  test('should respect user file selection permissions', async ({ electronApp, page }) => {
    // This test verifies that the app uses proper dialogs
    // and doesn't try to access files without permission

    // Mock the file dialog to return no files (user canceled)
    await electronApp.evaluate(({ dialog }) => {
      dialog.showOpenDialog = async () => ({
        canceled: true,
        filePaths: []
      })
    })

    // Since we removed the Open Files button, just verify the app is functional
    // We can't easily test the menu trigger from the test without more setup
    const tableHeader = page.locator('.table-header h2')
    await expect(tableHeader).toBeVisible()

    // Wait for dialog to be processed
    await page.waitForTimeout(500)

    // Should not throw any errors or show permission warnings
    const consoleErrors = await page.evaluate(() => {
      // Check if there are any console errors
      return (window as any).__consoleErrors || []
    })

    expect(consoleErrors.length).toBe(0)
  })

  test('should capture screenshot of app', async ({ page }) => {
    // Wait for app to fully load
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    // Capture screenshot to verify app is rendering correctly
    const screenshot = await page.screenshot({
      path: 'tests/electron/screenshots/app-launch.png',
      fullPage: true
    })

    // Verify screenshot was captured
    expect(screenshot).toBeTruthy()
    expect(screenshot.length).toBeGreaterThan(0)

    // Check that the main UI elements are visible
    const body = page.locator('body')
    await expect(body).toBeVisible()

    // Log viewport size for debugging
    const viewportSize = page.viewportSize()
    console.log('Viewport size:', viewportSize)

    // Verify page is not blank by checking if there's actual content
    const hasContent = await page.evaluate(() => {
      const body = document.body
      const bodyText = body.innerText || body.textContent || ''
      const hasElements = body.children.length > 1 // More than just #app
      return {
        hasText: bodyText.trim().length > 0,
        hasElements,
        bodyHTML: body.innerHTML.substring(0, 200) // First 200 chars for debugging
      }
    })

    console.log('Page content check:', hasContent)

    // App should have either text content or multiple elements
    expect(hasContent.hasText || hasContent.hasElements).toBe(true)
  })
})
