import { sharedElectronTest as test, expect } from './helpers/shared-electron'
import type { Page } from '@playwright/test'

test.describe('Caption Editor - Context Menu', () => {
  let appPage: Page

  test.beforeEach(async ({ page }) => {
    appPage = page
    await appPage.waitForSelector('.ag-root', { timeout: 10000 })
  })

  test('should expose delete dialog trigger from context menu integration', async () => {
    await appPage.evaluate(() => {
      const store = window.$store
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

    await appPage.waitForFunction(() => {
      const store = window.$store
      return store?.document?.segments?.length === 2
    })

    await appPage.evaluate(() => {
      const store = window.$store
      if (!store) return

      const segments = store.document.segments
      const selectedRows = [{ id: segments[0].id, text: segments[0].text }]
      store.requestSegmentDeletion(selectedRows.map((r: { id: string }) => r.id))
    })

    // The handoff is store state now, not a function hung on `window`.
    const hasContextMenuComponents = await appPage.evaluate(() => ({
      hasOpenDeleteConfirmDialog: window.$store.pendingDeletion !== null
    }))

    expect(hasContextMenuComponents.hasOpenDeleteConfirmDialog).toBe(true)
  })

  test('should open delete confirmation dialog when context menu option is triggered', async () => {
    await appPage.evaluate(() => {
      const store = window.$store
      if (!store) return

      const captionsContent = JSON.stringify({
        metadata: { id: 'delete-dialog-doc' },
        segments: [{ id: 'seg1', startTime: 1, endTime: 4, text: 'Test' }]
      }, null, 2)

      store.loadFromFile(captionsContent, '/test/file.captions_json5')
    })

    await appPage.waitForFunction(() => {
      const store = window.$store
      return store?.document?.segments?.length === 1
    })

    await appPage.evaluate(() => {
      const store = window.$store
      if (!store) return

      const segments = store.document.segments
      const selectedRows = [{ id: segments[0].id, text: segments[0].text }]
      store.requestSegmentDeletion(selectedRows.map((r: { id: string }) => r.id))
    })

    const deleteDialog = appPage.locator('.base-modal').filter({ hasText: 'Delete Selected Rows' })
    await expect(deleteDialog).toBeVisible()

    const cancelButton = deleteDialog.locator('button.dialog-button-secondary')
    await cancelButton.click()

    await expect(deleteDialog).not.toBeVisible()
  })

  test('should set speakers on multi-selected rows then delete one via context menu flow', async () => {
    await appPage.evaluate(() => {
      const store = window.$store
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

    await appPage.waitForFunction(() => {
      const store = window.$store
      return store?.document?.segments?.length === 2
    })

    await appPage.waitForSelector('.ag-center-cols-container .ag-row', { timeout: 5000 })

    await appPage.evaluate(() => {
      const gridApi = window.__agGridApi
      gridApi?.getRowNode('seg1')?.setSelected(true, false)
      gridApi?.getRowNode('seg2')?.setSelected(true, false)
    })

    await appPage.evaluate(() => {
      const gridApi = window.__agGridApi
      if (!gridApi) throw new Error('Grid API not available')
      gridApi.startEditingCell({ rowIndex: 0, colKey: 'speakerName' })
    })

    const editorInput = appPage.locator('.speaker-name-editor')
    await expect(editorInput).toBeVisible({ timeout: 5000 })
    await appPage.evaluate(() => {
      const input = document.querySelector('.speaker-name-editor') as HTMLInputElement | null
      if (!input) throw new Error('speaker-name-editor input not found')
      input.value = 'Alice'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await editorInput.press('Enter')
    await expect
      .poll(() => appPage.evaluate(
        () => window.$store.document.segments.filter((s: any) => s.speakerName === 'Alice').length
      ))
      .toBeGreaterThan(0)

    const speakerNames = await appPage.evaluate(() => {
      const store = window.$store
      if (!store) return null
      return store.document.segments.map((segment: any) => segment.speakerName)
    })
    expect(speakerNames[0]).toBe('Alice')
    expect(speakerNames[1]).toBe('Alice')

    await appPage.evaluate(() => {
      const store = window.$store
      if (!store) return
      const segments = store.document.segments
      const selectedRows = [{ id: segments[0].id, text: segments[0].text }]
      store.requestSegmentDeletion(selectedRows.map((r: { id: string }) => r.id))
    })

    const deleteDialog = appPage.locator('.base-modal').filter({ hasText: 'Delete Selected Rows' })
    await expect(deleteDialog).toBeVisible()

    await appPage.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const deleteBtn = buttons.find(
        (b) => b.textContent?.includes('Delete') && b.classList.contains('dialog-button-danger')
      )
      if (deleteBtn) deleteBtn.click()
    })

    await appPage.waitForFunction(() => {
      const store = window.$store
      return store?.document?.segments?.length === 1
    })

    const remainingSegments = await appPage.evaluate(() => {
      const store = window.$store
      if (!store) return null
      return store.document.segments
    })

    expect(remainingSegments).toHaveLength(1)
    expect(remainingSegments[0].text).toBe('Second')
    expect(remainingSegments[0].speakerName).toBe('Alice')
  })
})
