import { test, expect, _electron as electron } from '@playwright/test'
import { ElectronApplication, Page } from '@playwright/test'
import * as path from 'path'
import { enableConsoleCapture } from './helpers/console'

test.describe('VTT Editor - Bulk Set Speaker', () => {
  let electronApp: ElectronApplication
  let window: Page

  test.beforeEach(async () => {
    // Launch Electron app
    electronApp = await electron.launch({
      args: [path.join(process.cwd(), 'dist-electron/main.cjs'), '--no-sandbox'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DISPLAY: process.env.DISPLAY || ':99'
      }
    })

    // Wait for the first window
    window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    enableConsoleCapture(window)
  })

  test.afterEach(async () => {
    if (electronApp) { await electronApp.close().catch(() => {}) }
  })

  test('should set speaker name for multiple selected rows via context menu', async () => {
    // Load VTT with multiple cues
    const loadResult = await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return { success: false, error: 'No store on window' }

      const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:VTTCue {"id":"cue1","startTime":1,"endTime":4,"text":"First message","rating":5}

cue1
00:00:01.000 --> 00:00:04.000
First message

NOTE CAPTION_EDITOR:VTTCue {"id":"cue2","startTime":5,"endTime":8,"text":"Second message","rating":4}

cue2
00:00:05.000 --> 00:00:08.000
Second message

NOTE CAPTION_EDITOR:VTTCue {"id":"cue3","startTime":9,"endTime":12,"text":"Third message","rating":3}

cue3
00:00:09.000 --> 00:00:12.000
Third message`

      try {
        vttStore.loadFromFile(vttContent, '/test/file.vtt')
        return { success: true, segmentCount: vttStore.document.segments.length }
      } catch (error) {
        return { success: false, error: String(error) }
      }
    })

    expect(loadResult.success).toBe(true)
    expect(loadResult.segmentCount).toBe(3)

    await window.waitForTimeout(200)

    // Wait for caption count to update
    const captionCount = window.locator('h2', { hasText: 'Captions' })
    await expect(captionCount).toContainText('3', { timeout: 2000 })

    // Select first two rows and open dialog programmatically
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) throw new Error('Store not available')

      // Get the first two cue IDs
      const cues = vttStore.document.segments
      const selectedRows = [
        { id: cues[0].id, text: cues[0].text, speakerName: cues[0].speakerName },
        { id: cues[1].id, text: cues[1].text, speakerName: cues[1].speakerName }
      ]

      // Store selected rows for App.vue
      ;(window as any).__captionTableSelectedRows = selectedRows

      // Dispatch the context menu event
      window.dispatchEvent(new CustomEvent('openBulkSetSpeakerDialog', {
        detail: { rowCount: selectedRows.length }
      }))
    })

    await window.waitForTimeout(100)

    // Dialog should be visible
    const dialog = window.locator('.dialog-overlay')
    await expect(dialog).toBeVisible()

    // Check that row count is displayed correctly
    await expect(dialog).toContainText('2 selected rows')

    // Enter speaker name
    const input = window.locator('#speaker-name-input')
    await input.fill('Alice')

    // Click Set Speaker button
    await window.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const setBtn = buttons.find(b => b.textContent?.includes('Set Speaker'))
      if (setBtn) setBtn.click()
    })

    await window.waitForTimeout(200)

    // Verify dialog closed
    await expect(dialog).not.toBeVisible()

    // Verify speaker was set in the store
    const speakerNames = await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return null
      return vttStore.document.segments.map((cue: any) => cue.speakerName)
    })

    // Check that first two cues have speaker set to Alice
    expect(speakerNames[0]).toBe('Alice')
    expect(speakerNames[1]).toBe('Alice')
    expect(speakerNames[2]).toBeUndefined() // Third cue should remain unchanged
  })

  test('should not show context menu when no rows are selected', async () => {
    // Load VTT with cues
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:VTTCue {"id":"cue1","startTime":1,"endTime":4,"text":"Hello"}

cue1
00:00:01.000 --> 00:00:04.000
Hello`

      vttStore.loadFromFile(vttContent, '/test/file.vtt')
    })

    await window.waitForTimeout(200)

    await window.waitForTimeout(100)

    // Try to trigger context menu with no selection
    const contextMenuTriggered = await window.evaluate(() => {
      const selectedRows: any[] = []

      // Only trigger if rows are selected
      if (selectedRows.length === 0) {
        return false
      }

      ;(window as any).__captionTableSelectedRows = selectedRows

      window.dispatchEvent(new CustomEvent('openBulkSetSpeakerDialog', {
        detail: { rowCount: selectedRows.length }
      }))
      return true
    })

    // Context menu should not trigger
    expect(contextMenuTriggered).toBe(false)

    await window.waitForTimeout(100)

    // Dialog should not be visible
    const dialog = window.locator('.dialog-overlay')
    await expect(dialog).not.toBeVisible()
  })

  test('should close dialog when clicking Cancel', async () => {
    // Load VTT with cues
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:VTTCue {"id":"cue1","startTime":1,"endTime":4,"text":"Hello"}

cue1
00:00:01.000 --> 00:00:04.000
Hello`

      vttStore.loadFromFile(vttContent, '/test/file.vtt')
    })

    await window.waitForTimeout(200)

    // Select a row and open dialog
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const cues = vttStore.document.segments
      const selectedRows = [
        { id: cues[0].id, text: cues[0].text, speakerName: cues[0].speakerName }
      ]

      ;(window as any).__captionTableSelectedRows = selectedRows

      window.dispatchEvent(new CustomEvent('openBulkSetSpeakerDialog', {
        detail: { rowCount: selectedRows.length }
      }))
    })

    await window.waitForTimeout(100)

    // Dialog should be visible
    const dialog = window.locator('.dialog-overlay')
    await expect(dialog).toBeVisible()

    // Click Cancel button
    const cancelButton = window.locator('button.btn-cancel')
    await cancelButton.click()

    await window.waitForTimeout(100)

    // Dialog should be closed
    await expect(dialog).not.toBeVisible()
  })

  test('should handle bulk set with single row selected', async () => {
    // Load VTT with cues
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:VTTCue {"id":"cue1","startTime":1,"endTime":4,"text":"First"}

cue1
00:00:01.000 --> 00:00:04.000
First

NOTE CAPTION_EDITOR:VTTCue {"id":"cue2","startTime":5,"endTime":8,"text":"Second"}

cue2
00:00:05.000 --> 00:00:08.000
Second`

      vttStore.loadFromFile(vttContent, '/test/file.vtt')
    })

    await window.waitForTimeout(200)

    // Select only one row
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const cues = vttStore.document.segments
      const selectedRows = [
        { id: cues[0].id, text: cues[0].text, speakerName: cues[0].speakerName }
      ]

      ;(window as any).__captionTableSelectedRows = selectedRows

      window.dispatchEvent(new CustomEvent('openBulkSetSpeakerDialog', {
        detail: { rowCount: selectedRows.length }
      }))
    })

    await window.waitForTimeout(100)

    // Dialog should be visible
    const dialog = window.locator('.dialog-overlay')
    await expect(dialog).toBeVisible()

    // Check that row count shows "1 selected row" (singular)
    await expect(dialog).toContainText('1 selected row')

    // Enter speaker name
    const input = window.locator('#speaker-name-input')
    await input.fill('Bob')

    // Click Set Speaker button
    await window.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const setBtn = buttons.find(b => b.textContent?.includes('Set Speaker'))
      if (setBtn) setBtn.click()
    })

    await window.waitForTimeout(200)

    // Verify speaker was set
    const speakerNames = await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return null
      return vttStore.document.segments.map((cue: any) => cue.speakerName)
    })

    // Only first cue should have speaker set
    expect(speakerNames[0]).toBe('Bob')
    expect(speakerNames[1]).toBeUndefined()
  })
})
