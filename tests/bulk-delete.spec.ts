import { test, expect, _electron as electron } from '@playwright/test'
import { ElectronApplication, Page } from '@playwright/test'
import * as path from 'path'
import { enableConsoleCapture } from './helpers/console'

test.describe('VTT Editor - Bulk Delete', () => {
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
    if (electronApp) {
      await electronApp.close().catch(() => {
        // Ignore errors during cleanup
      })
    }
  })

  test('should delete multiple selected rows after confirmation', async () => {
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
Third message

NOTE CAPTION_EDITOR:VTTCue {"id":"cue4","startTime":13,"endTime":16,"text":"Fourth message","rating":2}

cue4
00:00:13.000 --> 00:00:16.000
Fourth message`

      try {
        vttStore.loadFromFile(vttContent, '/test/file.vtt')
        return { success: true, segmentCount: vttStore.document.segments.length }
      } catch (error) {
        return { success: false, error: String(error) }
      }
    })

    expect(loadResult.success).toBe(true)
    expect(loadResult.segmentCount).toBe(4)

    await window.waitForTimeout(200)

    // Wait for caption count to update
    const captionCount = window.locator('h2', { hasText: 'Captions' })
    await expect(captionCount).toContainText('4', { timeout: 2000 })

    // Select first two rows and trigger delete confirmation dialog
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) throw new Error('Store not available')

      // Get the first two cue IDs
      const cues = vttStore.document.segments
      const selectedRows = [
        { id: cues[0].id, text: cues[0].text },
        { id: cues[1].id, text: cues[1].text }
      ]

      // Store selected rows for App.vue
      ;(window as any).__captionTableSelectedRows = selectedRows

      // Dispatch the delete confirmation event
      window.dispatchEvent(new CustomEvent('openDeleteConfirmDialog', {
        detail: { rowCount: selectedRows.length }
      }))
    })

    await window.waitForTimeout(100)

    // Dialog should be visible
    const dialog = window.locator('.dialog-overlay')
    await expect(dialog).toBeVisible()

    // Check that row count is displayed correctly
    await expect(dialog).toContainText('2 rows')
    await expect(dialog).toContainText('Are you sure you want to delete')
    await expect(dialog).toContainText('This action cannot be undone')

    // Click Delete button
    await window.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const deleteBtn = buttons.find(b => b.textContent?.includes('Delete') && b.classList.contains('btn-delete'))
      if (deleteBtn) deleteBtn.click()
    })

    await window.waitForTimeout(200)

    // Verify dialog closed
    await expect(dialog).not.toBeVisible()

    // Verify rows were deleted in the store
    const remainingCues = await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return null
      return vttStore.document.segments.map((cue: any) => ({
        id: cue.id,
        text: cue.text
      }))
    })

    expect(remainingCues).toHaveLength(2)
    expect(remainingCues[0].text).toBe('Third message')
    expect(remainingCues[1].text).toBe('Fourth message')

    // Verify caption count updated
    await expect(captionCount).toContainText('2', { timeout: 2000 })
  })

  test('should delete single row after confirmation', async () => {
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
        { id: cues[0].id, text: cues[0].text }
      ]

      ;(window as any).__captionTableSelectedRows = selectedRows

      window.dispatchEvent(new CustomEvent('openDeleteConfirmDialog', {
        detail: { rowCount: selectedRows.length }
      }))
    })

    await window.waitForTimeout(100)

    // Dialog should be visible
    const dialog = window.locator('.dialog-overlay')
    await expect(dialog).toBeVisible()

    // Check that row count shows "1 row" (singular)
    await expect(dialog).toContainText('1 row')

    // Click Delete button
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
  })

  test('should cancel delete when clicking Cancel button', async () => {
    // Load VTT with cues
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:VTTCue {"id":"cue1","startTime":1,"endTime":4,"text":"Hello"}

cue1
00:00:01.000 --> 00:00:04.000
Hello

NOTE CAPTION_EDITOR:VTTCue {"id":"cue2","startTime":5,"endTime":8,"text":"World"}

cue2
00:00:05.000 --> 00:00:08.000
World`

      vttStore.loadFromFile(vttContent, '/test/file.vtt')
    })

    await window.waitForTimeout(200)

    // Select a row and open delete dialog
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

    // Dialog should be visible
    const dialog = window.locator('.dialog-overlay')
    await expect(dialog).toBeVisible()

    // Click Cancel button
    const cancelButton = window.locator('button.btn-cancel')
    await cancelButton.click()

    await window.waitForTimeout(100)

    // Dialog should be closed
    await expect(dialog).not.toBeVisible()

    // Verify nothing was deleted
    const cues = await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return null
      return vttStore.document.segments
    })

    expect(cues).toHaveLength(2)
  })

  test('should clear selectedCueId if deleted cue was selected', async () => {
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

      // Select the first cue
      vttStore.selectCue('cue1')
    })

    await window.waitForTimeout(200)

    // Verify cue is selected
    const selectedBefore = await window.evaluate(() => {
      const vttStore = (window as any).$store
      return vttStore ? vttStore.selectedCueId : null
    })

    expect(selectedBefore).toBe('cue1')

    // Delete the selected cue
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

    // Confirm delete
    await window.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const deleteBtn = buttons.find(b => b.textContent?.includes('Delete') && b.classList.contains('btn-delete'))
      if (deleteBtn) deleteBtn.click()
    })

    await window.waitForTimeout(200)

    // Verify selectedCueId was cleared
    const selectedAfter = await window.evaluate(() => {
      const vttStore = (window as any).$store
      return vttStore ? vttStore.selectedCueId : null
    })

    expect(selectedAfter).toBeNull()
  })
})
