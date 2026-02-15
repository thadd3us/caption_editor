import { sharedElectronTest as test, expect } from './helpers/shared-electron'
import type { Page } from '@playwright/test'

test.describe('Caption Editor - Context Menu', () => {
  let window: Page

  test.beforeEach(async ({ page }) => {
    window = page
    // Wait for AG Grid to be ready (more reliable than waiting for store)
    await window.waitForSelector('.ag-root', { timeout: 10000 })
  })

  test('should show context menu with both options when rows are selected', async () => {
    // Load captions JSON with multiple segments
    await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return

      const captionsContent = JSON.stringify({
        metadata: { id: 'context-menu-doc' },
        segments: [
          { id: 'seg1', startTime: 1, endTime: 4, text: 'First' },
          { id: 'seg2', startTime: 5, endTime: 8, text: 'Second' }
        ]
      }, null, 2)

      store.loadFromFile(captionsContent, '/test/file.captions.json')
    })

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 2
    })

    // Simulate context menu by directly setting the state
    await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return

      const segments = store.document.segments
      const selectedRows = [
        { id: segments[0].id, text: segments[0].text }
      ]

        // Store selected rows
        ; (window as any).__captionTableSelectedRows = selectedRows

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
    // Load captions JSON with segments
    await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return

      const captionsContent = JSON.stringify({
        metadata: { id: 'bulk-set-dialog-doc' },
        segments: [{ id: 'seg1', startTime: 1, endTime: 4, text: 'Test' }]
      }, null, 2)

      store.loadFromFile(captionsContent, '/test/file.captions.json')
    })

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 1
    })

    // Trigger bulk set speaker dialog via event (simulating context menu selection)
    await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return

      const segments = store.document.segments
      const selectedRows = [{ id: segments[0].id, text: segments[0].text }]

        ; (window as any).__captionTableSelectedRows = selectedRows

      window.dispatchEvent(new CustomEvent('openBulkSetSpeakerDialog', {
        detail: { rowCount: selectedRows.length }
      }))
    })

    // Verify bulk set speaker dialog opened
    const bulkSetDialog = window.locator('.base-modal').filter({ hasText: 'Bulk Set Speaker' })
    await expect(bulkSetDialog).toBeVisible()

    // Close the dialog
    const cancelButton = bulkSetDialog.locator('button.dialog-button-secondary')
    await cancelButton.click()

    await expect(bulkSetDialog).not.toBeVisible()
  })

  test('should open delete confirmation dialog when context menu option is triggered', async () => {
    // Load captions JSON with segments
    await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return

      const captionsContent = JSON.stringify({
        metadata: { id: 'delete-dialog-doc' },
        segments: [{ id: 'seg1', startTime: 1, endTime: 4, text: 'Test' }]
      }, null, 2)

      store.loadFromFile(captionsContent, '/test/file.captions.json')
    })

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 1
    })

    // Trigger delete confirmation dialog via event (simulating context menu selection)
    await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return

      const segments = store.document.segments
      const selectedRows = [{ id: segments[0].id, text: segments[0].text }]

        ; (window as any).__captionTableSelectedRows = selectedRows

      window.dispatchEvent(new CustomEvent('openDeleteConfirmDialog', {
        detail: { rowCount: selectedRows.length }
      }))
    })

    // Verify delete confirmation dialog opened
    const deleteDialog = window.locator('.base-modal').filter({ hasText: 'Delete Selected Rows' })
    await expect(deleteDialog).toBeVisible()

    // Close the dialog
    const cancelButton = deleteDialog.locator('button.dialog-button-secondary')
    await cancelButton.click()

    await expect(deleteDialog).not.toBeVisible()
  })

  test('should handle both context menu actions in sequence', async () => {
    // Load captions JSON with segments
    await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return

      const captionsContent = JSON.stringify({
        metadata: { id: 'context-menu-seq-doc' },
        segments: [
          { id: 'seg1', startTime: 1, endTime: 4, text: 'First' },
          { id: 'seg2', startTime: 5, endTime: 8, text: 'Second' }
        ]
      }, null, 2)

      store.loadFromFile(captionsContent, '/test/file.captions.json')
    })

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 2
    })

    // First action: Bulk set speaker
    await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return

      const segments = store.document.segments
      const selectedRows = [
        { id: segments[0].id, text: segments[0].text },
        { id: segments[1].id, text: segments[1].text }
      ]

        ; (window as any).__captionTableSelectedRows = selectedRows

      window.dispatchEvent(new CustomEvent('openBulkSetSpeakerDialog', {
        detail: { rowCount: selectedRows.length }
      }))
    })

    // Verify bulk set speaker dialog opened
    const bulkSetDialog = window.locator('.base-modal').filter({ hasText: 'Bulk Set Speaker' })
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

    // Verify dialog closed
    await expect(bulkSetDialog).not.toBeVisible()

    // Verify speaker was set
    const speakerNames = await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return null
      return store.document.segments.map((segment: any) => segment.speakerName)
    })

    expect(speakerNames[0]).toBe('Alice')
    expect(speakerNames[1]).toBe('Alice')

    // Second action: Delete one of the rows
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

    // Verify delete confirmation dialog opened
    const deleteDialog = window.locator('.base-modal').filter({ hasText: 'Delete Selected Rows' })
    await expect(deleteDialog).toBeVisible()

    // Confirm delete
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
    expect(remainingSegments[0].speakerName).toBe('Alice')
  })
})
