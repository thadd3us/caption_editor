import { sharedElectronTest as test, expect } from './helpers/shared-electron'
import type { Page } from '@playwright/test'

test.describe('Caption Editor - Bulk Delete', () => {
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

    // Load captions JSON with multiple segments
    const loadResult = await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return { success: false, error: 'No store on window' }

      const captionsContent = JSON.stringify({
        metadata: { id: 'bulk-delete-doc' },
        segments: [
          { id: 'seg1', startTime: 1, endTime: 4, text: 'First message', rating: 5 },
          { id: 'seg2', startTime: 5, endTime: 8, text: 'Second message', rating: 4 },
          { id: 'seg3', startTime: 9, endTime: 12, text: 'Third message', rating: 3 },
          { id: 'seg4', startTime: 13, endTime: 16, text: 'Fourth message', rating: 2 }
        ]
      }, null, 2)

      try {
        store.loadFromFile(captionsContent, '/test/file.captions_json')
        return { success: true, segmentCount: store.document.segments.length }
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
      const store = (window as any).$store
      if (!store) throw new Error('Store not available')

      // Get the first two segment IDs
      const segments = store.document.segments
      const selectedRows = [
        { id: segments[0].id, text: segments[0].text },
        { id: segments[1].id, text: segments[1].text }
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
    const remainingSegments = await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return null
      return store.document.segments.map((segment: any) => ({
        id: segment.id,
        text: segment.text
      }))
    })

    expect(remainingSegments).toHaveLength(2)
    expect(remainingSegments[0].text).toBe('Third message')
    expect(remainingSegments[1].text).toBe('Fourth message')

    // Verify caption count updated
    await expect(captionCount).toContainText('2', { timeout: 2000 })
  })

  test('should delete single row after confirmation', async () => {
    // Load captions JSON with segments
    await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return

      const captionsContent = JSON.stringify({
        metadata: { id: 'single-delete-doc' },
        segments: [
          { id: 'seg1', startTime: 1, endTime: 4, text: 'First' },
          { id: 'seg2', startTime: 5, endTime: 8, text: 'Second' }
        ]
      }, null, 2)

      store.loadFromFile(captionsContent, '/test/file.captions_json')
    })

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 2
    })

    // Select only one row
    await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return

      const segments = store.document.segments
      const selectedRows = [
        { id: segments[0].id, text: segments[0].text }
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
    const remainingSegments = await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return null
      return store.document.segments
    })

    expect(remainingSegments).toHaveLength(1)
    expect(remainingSegments[0].text).toBe('Second')
  })

  test('should cancel delete when clicking Cancel button', async () => {
    // Load captions JSON with segments
    await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return

      const captionsContent = JSON.stringify({
        metadata: { id: 'cancel-delete-doc' },
        segments: [
          { id: 'seg1', startTime: 1, endTime: 4, text: 'Hello' },
          { id: 'seg2', startTime: 5, endTime: 8, text: 'World' }
        ]
      }, null, 2)

      store.loadFromFile(captionsContent, '/test/file.captions_json')
    })

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 2
    })

    // Select a row and open delete dialog
    await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return

      const segments = store.document.segments
      const selectedRows = [
        { id: segments[0].id, text: segments[0].text }
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
    const segments = await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return null
      return store.document.segments
    })

    expect(segments).toHaveLength(2)
  })

  test('should clear selectedSegmentId if deleted segment was selected', async () => {
    // Load captions JSON with segments
    await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return

      const captionsContent = JSON.stringify({
        metadata: { id: 'selected-delete-doc' },
        segments: [
          { id: 'seg1', startTime: 1, endTime: 4, text: 'First' },
          { id: 'seg2', startTime: 5, endTime: 8, text: 'Second' }
        ]
      }, null, 2)

      store.loadFromFile(captionsContent, '/test/file.captions_json')

      // Select the first segment
      store.selectSegment('seg1')
    })

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.selectedSegmentId === 'seg1'
    })

    // Verify segment is selected
    const selectedBefore = await window.evaluate(() => {
      const store = (window as any).$store
      return store ? store.selectedSegmentId : null
    })

    expect(selectedBefore).toBe('seg1')

    // Delete the selected segment
    await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return

      const segments = store.document.segments
      const selectedRows = [
        { id: segments[0].id, text: segments[0].text }
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
      return store?.selectedSegmentId === null
    })

    // Verify selectedSegmentId was cleared
    const selectedAfter = await window.evaluate(() => {
      const store = (window as any).$store
      return store ? store.selectedSegmentId : null
    })

    expect(selectedAfter).toBeNull()
  })
})
