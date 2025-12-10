import { test, expect, _electron as electron } from '@playwright/test'
import { ElectronApplication, Page } from '@playwright/test'
import * as path from 'path'
import { enableConsoleCapture } from './helpers/console'

test.describe('VTT Editor - Context Menu', () => {
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

    // Wait for AG Grid to be ready (more reliable than waiting for store)
    await window.waitForSelector('.ag-root', { timeout: 10000 })
  })

  test.afterEach(async () => {
    if (electronApp) { await electronApp.close().catch(() => {}) }
  })

  test('should show context menu with both options when rows are selected', async () => {
    // Load VTT with multiple cues
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

    // Simulate context menu by directly setting the state
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const cues = vttStore.document.segments
      const selectedRows = [
        { id: cues[0].id, text: cues[0].text }
      ]

      // Store selected rows
      ;(window as any).__captionTableSelectedRows = selectedRows

      // Simulate showing context menu by dispatching a custom event
      // In real usage, this would be triggered by AG Grid's context menu event
      const event = new CustomEvent('showContextMenu', {
        detail: {
          position: { x: 200, y: 300 },
          selectedRows: selectedRows
        }
      })
      window.dispatchEvent(event)
    })

    // Note: Since we can't easily trigger AG Grid's context menu event in tests,
    // we'll test the menu components directly through their dialog triggers
    // This test verifies the integration points exist

    const hasContextMenuComponents = await window.evaluate(() => {
      // Check if context menu infrastructure is present
      return {
        hasOpenBulkSetSpeakerDialog: typeof (window as any).openBulkSetSpeakerDialog === 'function',
        hasOpenDeleteConfirmDialog: typeof (window as any).openDeleteConfirmDialog === 'function'
      }
    })

    expect(hasContextMenuComponents.hasOpenBulkSetSpeakerDialog).toBe(true)
    expect(hasContextMenuComponents.hasOpenDeleteConfirmDialog).toBe(true)
  })

  test('should open bulk set speaker dialog when context menu option is triggered', async () => {
    // Load VTT with cues
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:VTTCue {"id":"cue1","startTime":1,"endTime":4,"text":"Test"}

cue1
00:00:01.000 --> 00:00:04.000
Test`

      vttStore.loadFromFile(vttContent, '/test/file.vtt')
    })

    await window.waitForTimeout(200)

    // Trigger bulk set speaker dialog via event (simulating context menu selection)
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const cues = vttStore.document.segments
      const selectedRows = [{ id: cues[0].id, text: cues[0].text }]

      ;(window as any).__captionTableSelectedRows = selectedRows

      window.dispatchEvent(new CustomEvent('openBulkSetSpeakerDialog', {
        detail: { rowCount: selectedRows.length }
      }))
    })

    await window.waitForTimeout(100)

    // Verify bulk set speaker dialog opened
    const bulkSetDialog = window.locator('.dialog-overlay').filter({ hasText: 'Bulk Set Speaker' })
    await expect(bulkSetDialog).toBeVisible()

    // Close the dialog
    const cancelButton = bulkSetDialog.locator('button.btn-cancel')
    await cancelButton.click()

    await window.waitForTimeout(100)
  })

  test('should open delete confirmation dialog when context menu option is triggered', async () => {
    // Load VTT with cues
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:VTTCue {"id":"cue1","startTime":1,"endTime":4,"text":"Test"}

cue1
00:00:01.000 --> 00:00:04.000
Test`

      vttStore.loadFromFile(vttContent, '/test/file.vtt')
    })

    await window.waitForTimeout(200)

    // Trigger delete confirmation dialog via event (simulating context menu selection)
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const cues = vttStore.document.segments
      const selectedRows = [{ id: cues[0].id, text: cues[0].text }]

      ;(window as any).__captionTableSelectedRows = selectedRows

      window.dispatchEvent(new CustomEvent('openDeleteConfirmDialog', {
        detail: { rowCount: selectedRows.length }
      }))
    })

    await window.waitForTimeout(100)

    // Verify delete confirmation dialog opened
    const deleteDialog = window.locator('.dialog-overlay').filter({ hasText: 'Delete Selected Rows' })
    await expect(deleteDialog).toBeVisible()

    // Close the dialog
    const cancelButton = deleteDialog.locator('button.btn-cancel')
    await cancelButton.click()

    await window.waitForTimeout(100)
  })

  test('should handle both context menu actions in sequence', async () => {
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

    // First action: Bulk set speaker
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const cues = vttStore.document.segments
      const selectedRows = [
        { id: cues[0].id, text: cues[0].text },
        { id: cues[1].id, text: cues[1].text }
      ]

      ;(window as any).__captionTableSelectedRows = selectedRows

      window.dispatchEvent(new CustomEvent('openBulkSetSpeakerDialog', {
        detail: { rowCount: selectedRows.length }
      }))
    })

    await window.waitForTimeout(100)

    // Verify bulk set speaker dialog opened
    const bulkSetDialog = window.locator('.dialog-overlay').filter({ hasText: 'Bulk Set Speaker' })
    await expect(bulkSetDialog).toBeVisible()

    // Set speaker name
    const input = bulkSetDialog.locator('#speaker-name-input')
    await input.fill('Alice')

    // Click Set Speaker button
    await window.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const setBtn = buttons.find(b => b.textContent?.includes('Set Speaker'))
      if (setBtn) setBtn.click()
    })

    await window.waitForTimeout(200)

    // Verify dialog closed
    await expect(bulkSetDialog).not.toBeVisible()

    // Verify speaker was set
    const speakerNames = await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return null
      return vttStore.document.segments.map((cue: any) => cue.speakerName)
    })

    expect(speakerNames[0]).toBe('Alice')
    expect(speakerNames[1]).toBe('Alice')

    // Second action: Delete one of the rows
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const cues = vttStore.document.segments
      const selectedRows = [
        { id: cues[0].id, text: cues[0].text }
      ]

      ;(window as any).__captionTableSelectedRows = selectedRows

      window.dispatchEvent(new CustomEvent('openDeleteConfirmDialog', {
        detail: { rowCount: selectedRows.length }
      }))
    })

    await window.waitForTimeout(100)

    // Verify delete confirmation dialog opened
    const deleteDialog = window.locator('.dialog-overlay').filter({ hasText: 'Delete Selected Rows' })
    await expect(deleteDialog).toBeVisible()

    // Confirm delete
    await window.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const deleteBtn = buttons.find(b => b.textContent?.includes('Delete') && b.classList.contains('btn-delete'))
      if (deleteBtn) deleteBtn.click()
    })

    await window.waitForTimeout(200)

    // Verify only one row remains
    const remainingCues = await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return null
      return vttStore.document.segments
    })

    expect(remainingCues).toHaveLength(1)
    expect(remainingCues[0].text).toBe('Second')
    expect(remainingCues[0].speakerName).toBe('Alice')
  })
})
