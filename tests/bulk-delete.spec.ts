import { sharedElectronTest as test, expect } from './helpers/shared-electron'
import type { Page } from '@playwright/test'

test.describe('VTT Editor - Bulk Delete', () => {
  let window: Page

  test.beforeEach(async ({ page }) => {
    window = page
    // Wait for AG Grid to be ready (more reliable than waiting for store)
    await window.waitForSelector('.ag-root', { timeout: 10000 })
  })

  test('should delete multiple selected rows after confirmation', async ({ page }) => {
    window = page
    // Wait for store to be available
    await window.waitForFunction(() => {
      return (window as any).$store !== undefined
    }, { timeout: 5000 })

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
        ; (window as any).__captionTableSelectedRows = selectedRows

      // Dispatch the delete confirmation event
      window.dispatchEvent(new CustomEvent('openDeleteConfirmDialog', {
        detail: { rowCount: selectedRows.length }
      }))
    })

    // Dialog should be visible
    const dialog = window.locator('.base-modal-overlay')
    await expect(dialog).toBeVisible()

    // Check that row count is displayed correctly
    await expect(dialog).toContainText('2 rows')
    await expect(dialog).toContainText('Are you sure you want to delete')
    await expect(dialog).toContainText('This action cannot be undone')

    // Click Delete button
    await window.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const deleteBtn = buttons.find(b => b.textContent?.includes('Delete') && b.classList.contains('dialog-button-danger'))
      if (deleteBtn) deleteBtn.click()
    })

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

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 2
    })

    // Select only one row
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const cues = vttStore.document.segments
      const selectedRows = [
        { id: cues[0].id, text: cues[0].text }
      ]

        ; (window as any).__captionTableSelectedRows = selectedRows

      window.dispatchEvent(new CustomEvent('openDeleteConfirmDialog', {
        detail: { rowCount: selectedRows.length }
      }))
    })

    // Dialog should be visible
    const dialog = window.locator('.base-modal-overlay')
    await expect(dialog).toBeVisible()

    // Check that row count shows "1 row" (singular)
    await expect(dialog).toContainText('1 row')

    // Click Delete button
    await window.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const deleteBtn = buttons.find(b => b.textContent?.includes('Delete') && b.classList.contains('dialog-button-danger'))
      if (deleteBtn) deleteBtn.click()
    })

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 1
    })

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

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 2
    })

    // Select a row and open delete dialog
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const cues = vttStore.document.segments
      const selectedRows = [
        { id: cues[0].id, text: cues[0].text }
      ]

        ; (window as any).__captionTableSelectedRows = selectedRows

      window.dispatchEvent(new CustomEvent('openDeleteConfirmDialog', {
        detail: { rowCount: selectedRows.length }
      }))
    })

    // Dialog should be visible
    const dialog = window.locator('.base-modal-overlay')
    await expect(dialog).toBeVisible()

    // Click Cancel button
    const cancelButton = window.locator('button.dialog-button-secondary')
    await cancelButton.click()

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

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.selectedCueId === 'cue1'
    })

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

        ; (window as any).__captionTableSelectedRows = selectedRows

      window.dispatchEvent(new CustomEvent('openDeleteConfirmDialog', {
        detail: { rowCount: selectedRows.length }
      }))
    })

    // Wait for dialog
    await window.waitForSelector('.base-modal-overlay', { state: 'visible' })

    // Confirm delete
    await window.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const deleteBtn = buttons.find(b => b.textContent?.includes('Delete') && b.classList.contains('dialog-button-danger'))
      if (deleteBtn) deleteBtn.click()
    })

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.selectedCueId === null
    })

    // Verify selectedCueId was cleared
    const selectedAfter = await window.evaluate(() => {
      const vttStore = (window as any).$store
      return vttStore ? vttStore.selectedCueId : null
    })

    expect(selectedAfter).toBeNull()
  })
})
