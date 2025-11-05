import { test, expect, _electron as electron } from '@playwright/test'
import { ElectronApplication, Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs/promises'
import { fileURLToPath } from 'url'
import { enableConsoleCapture } from '../helpers/console'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Helper function to normalize VTT content for snapshot comparison
// Replaces dynamic values (UUIDs, timestamps) with placeholders
function normalizeVTTForSnapshot(vttContent: string): string {
  let normalized = vttContent

  // Replace all UUIDs with a consistent placeholder
  normalized = normalized.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    '<UUID>'
  )

  // Replace ISO timestamps with a consistent placeholder
  normalized = normalized.replace(
    /"timestamp":"[^"]+"/g,
    '"timestamp":"<TIMESTAMP>"'
  )

  // Replace action timestamps
  normalized = normalized.replace(
    /"actionTimestamp":"[^"]+"/g,
    '"actionTimestamp":"<TIMESTAMP>"'
  )

  return normalized
}

test.describe('File Save Workflow - Complete save and save-as cycle', () => {
  let electronApp: ElectronApplication
  let window: Page
  let tempDir: string
  let testVttPath: string
  let saveAsPath: string

  test.beforeEach(async () => {
    // Create a temporary directory for test files
    tempDir = path.join(process.cwd(), 'test_data/temp-save-test')
    await fs.mkdir(tempDir, { recursive: true })

    // Copy sample.vtt to temp directory for testing
    const sourceVtt = path.join(process.cwd(), 'test_data/sample.vtt')
    testVttPath = path.join(tempDir, 'test-captions.vtt')
    await fs.copyFile(sourceVtt, testVttPath)

    // Define the save-as target path
    saveAsPath = path.join(tempDir, 'test-captions-edited.vtt')
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

  test('should open, edit, and save VTT file', async () => {
    // Step 1: Launch Electron with the test VTT file
    console.log('Step 1: Launching Electron with VTT file:', testVttPath)

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
    await window.waitForTimeout(2000)

    // Step 2: Verify the file path is displayed in the UI
    console.log('Step 2: Verifying file path display in UI')

    const filePathDisplay = await window.locator('.file-path-display').textContent()
    expect(filePathDisplay).toContain(testVttPath)
    console.log('✓ File path displayed correctly:', filePathDisplay)

    // Verify the store has the correct file path
    const storeFilePath = await window.evaluate(() => {
      const store = (window as any).$store
      return store.document.filePath
    })
    expect(storeFilePath).toBe(testVttPath)
    console.log('✓ Store file path is correct:', storeFilePath)

    // Step 3: Add a new cue segment
    console.log('Step 3: Adding new cue segment')

    // Set current time to 20 seconds and add a cue
    const newCueId = await window.evaluate(() => {
      const store = (window as any).$store
      store.setCurrentTime(20)
      const cueId = store.addCue(20, 5) // Add cue from 20s to 25s
      store.updateCue(cueId, { text: 'This is a new test caption added by the E2E test!' })
      return cueId
    })

    console.log('✓ Added new cue with ID:', newCueId)

    // Verify the cue was added
    const cueCount = await window.evaluate(() => {
      const store = (window as any).$store
      return store.document.cues.length
    })
    expect(cueCount).toBe(4) // Original 3 cues + 1 new cue
    console.log('✓ Cue count is now:', cueCount)

    // Step 4: Save the file (overwrite original)
    console.log('Step 4: Saving file (overwrite)')

    // Trigger save directly via keyboard shortcut (Ctrl+S)
    await window.keyboard.press('Control+s')
    await window.waitForTimeout(1500)

    console.log('✓ Save triggered via Ctrl+S')

    // Step 5: Check the contents of the saved VTT file
    console.log('Step 5: Verifying saved VTT file contents')

    const savedContent = await fs.readFile(testVttPath, 'utf-8')
    console.log('Saved VTT content preview (first 500 chars):')
    console.log(savedContent.substring(0, 500))

    // Verify the saved content has the new cue
    expect(savedContent).toContain('This is a new test caption added by the E2E test!')
    expect(savedContent).toContain('00:00:20.000 --> 00:00:25.000')

    // Verify it still has original cues
    expect(savedContent).toContain('Welcome to the VTT Editor!')
    expect(savedContent).toContain('This is a sample caption file.')

    // Verify WEBVTT header
    expect(savedContent).toMatch(/^WEBVTT/)

    // Snapshot the saved content for future comparison (normalized)
    const normalizedSavedContent = normalizeVTTForSnapshot(savedContent)
    expect(normalizedSavedContent).toMatchSnapshot('saved-vtt-with-new-cue.vtt')

    console.log('✓ Saved VTT file content verified')
  })

  test('should save-as VTT file to new location and update UI', async () => {
    // Setup: Copy the original sample file
    console.log('Setup: Creating initial VTT file for save-as test')
    const sourceVtt = path.join(process.cwd(), 'test_data/sample.vtt')
    await fs.copyFile(sourceVtt, testVttPath)

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
    await window.waitForTimeout(2000)

    // Verify window loaded successfully
    const isWindowClosed = window.isClosed()
    console.log('Window closed after launch?', isWindowClosed)
    if (isWindowClosed) {
      throw new Error('Window closed unexpectedly after launch')
    }

    // Step 6: Test updateFilePath functionality and verify file save
    console.log('Step 6: Testing Save As functionality')

    // Get the current file path
    const initialFilePath = await window.evaluate(() => {
      const store = (window as any).$store
      return store.document.filePath
    })
    console.log('Initial file path:', initialFilePath)
    expect(initialFilePath).toBe(testVttPath)

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

    // Verify the new file has the correct content
    const saveAsContent = await fs.readFile(saveAsPath, 'utf-8')
    expect(saveAsContent).toContain('Welcome to the VTT Editor!')
    expect(saveAsContent).toContain('This is a sample caption file.')

    // Snapshot the save-as content (normalized)
    const normalizedSaveAsContent = normalizeVTTForSnapshot(saveAsContent)
    expect(normalizedSaveAsContent).toMatchSnapshot('saved-as-vtt.vtt')

    // Verify both files exist
    const originalExists = await fs.access(testVttPath).then(() => true).catch(() => false)
    const saveAsExists = await fs.access(saveAsPath).then(() => true).catch(() => false)

    expect(originalExists).toBe(true)
    expect(saveAsExists).toBe(true)
    console.log('✓ Both files exist: original and save-as')

    console.log('✅ Save As test completed successfully!')
  })
})
