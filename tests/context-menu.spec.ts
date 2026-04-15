import { sharedElectronTest as test, expect } from './helpers/shared-electron'
import type { Page } from '@playwright/test'

test.describe('Caption Editor - Context Menu', () => {
  let window: Page

  test.beforeEach(async ({ page }) => {
    window = page
    await window.waitForSelector('.ag-root', { timeout: 10000 })
  })

  test('should expose delete dialog trigger from context menu integration', async () => {
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

      store.loadFromFile(captionsContent, '/test/file.captions_json5')
    })

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 2
    })

    await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return

      const segments = store.document.segments
      const selectedRows = [{ id: segments[0].id, text: segments[0].text }]
      ;(window as any).__captionTableSelectedRows = selectedRows

      const event = new CustomEvent('showContextMenu', {
        detail: {
          position: { x: 200, y: 300 },
          selectedRows
        }
      })
      window.dispatchEvent(event)
    })

    const hasContextMenuComponents = await window.evaluate(() => ({
      hasOpenDeleteConfirmDialog: typeof (window as any).openDeleteConfirmDialog === 'function'
    }))

    expect(hasContextMenuComponents.hasOpenDeleteConfirmDialog).toBe(true)
  })

  test('should open delete confirmation dialog when context menu option is triggered', async () => {
    await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return

      const captionsContent = JSON.stringify({
        metadata: { id: 'delete-dialog-doc' },
        segments: [{ id: 'seg1', startTime: 1, endTime: 4, text: 'Test' }]
      }, null, 2)

      store.loadFromFile(captionsContent, '/test/file.captions_json5')
    })

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 1
    })

    await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return

      const segments = store.document.segments
      const selectedRows = [{ id: segments[0].id, text: segments[0].text }]
      ;(window as any).__captionTableSelectedRows = selectedRows

      window.dispatchEvent(
        new CustomEvent('openDeleteConfirmDialog', {
          detail: { rowCount: selectedRows.length }
        })
      )
    })

    const deleteDialog = window.locator('.base-modal').filter({ hasText: 'Delete Selected Rows' })
    await expect(deleteDialog).toBeVisible()

    const cancelButton = deleteDialog.locator('button.dialog-button-secondary')
    await cancelButton.click()

    await expect(deleteDialog).not.toBeVisible()
  })

  test('should set speakers on multi-selected rows then delete one via context menu flow', async () => {
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

      store.loadFromFile(captionsContent, '/test/file.captions_json5')
    })

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 2
    })

    await window.waitForSelector('.ag-center-cols-container .ag-row', { timeout: 5000 })

    await window.evaluate(() => {
      const gridApi = (window as any).__agGridApi
      gridApi?.getRowNode('seg1')?.setSelected(true, false)
      gridApi?.getRowNode('seg2')?.setSelected(true, false)
    })

    await window.evaluate(() => {
      const gridApi = (window as any).__agGridApi
      if (!gridApi) throw new Error('Grid API not available')
      gridApi.startEditingCell({ rowIndex: 0, colKey: 'speakerName' })
    })

    const editorInput = window.locator('.speaker-name-editor')
    await expect(editorInput).toBeVisible({ timeout: 5000 })
    await window.evaluate(() => {
      const input = document.querySelector('.speaker-name-editor') as HTMLInputElement | null
      if (!input) throw new Error('speaker-name-editor input not found')
      input.value = 'Alice'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await editorInput.press('Enter')
    await window.waitForTimeout(200)

    const speakerNames = await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return null
      return store.document.segments.map((segment: any) => segment.speakerName)
    })
    expect(speakerNames[0]).toBe('Alice')
    expect(speakerNames[1]).toBe('Alice')

    await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return
      const segments = store.document.segments
      const selectedRows = [{ id: segments[0].id, text: segments[0].text }]
      ;(window as any).__captionTableSelectedRows = selectedRows
      window.dispatchEvent(
        new CustomEvent('openDeleteConfirmDialog', {
          detail: { rowCount: selectedRows.length }
        })
      )
    })

    const deleteDialog = window.locator('.base-modal').filter({ hasText: 'Delete Selected Rows' })
    await expect(deleteDialog).toBeVisible()

    await window.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const deleteBtn = buttons.find(
        (b) => b.textContent?.includes('Delete') && b.classList.contains('dialog-button-danger')
      )
      if (deleteBtn) deleteBtn.click()
    })

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 1
    })

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
