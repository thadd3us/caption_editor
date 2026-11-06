import { sharedElectronTest as test, expect } from '../helpers/shared-electron'
import type { Page } from '@playwright/test'
import { expectGridCaptionTotal } from '../helpers/wait-helpers'

/**
 * Undo/redo end to end.
 *
 * `captionStore.undo.test.ts` covers the stack itself. What needs a real Electron
 * window is the wiring: the Edit menu no longer uses `role: 'undo'`, so Cmd+Z now
 * arrives as an IPC message and the renderer decides whether it belongs to the
 * document or to a focused text field. Getting that split wrong is invisible to a
 * unit test and very visible to a user — typing in a cell and hitting Cmd+Z would
 * revert someone else's edit instead of their own keystroke.
 */
test.describe('Undo / redo', () => {
  async function loadThreeSegments(page: Page) {
    await page.evaluate(() => {
      const store = window.$store
      store.reset()
      store.loadFromFile(
        JSON.stringify({
          metadata: { id: 'undo-e2e' },
          segments: [
            { id: 'u1', startTime: 0, endTime: 2, text: 'alpha', speakerName: 'Ann' },
            { id: 'u2', startTime: 3, endTime: 5, text: 'beta', speakerName: 'Bob' },
            { id: 'u3', startTime: 6, endTime: 8, text: 'gamma', speakerName: 'Cal' },
          ],
        }),
        '/tmp/undo-e2e.captions_json5'
      )
    })
    await expectGridCaptionTotal(page, 3, 5000)
  }

  const texts = (page: Page) =>
    page.evaluate(() =>
      window.$store.document.segments.map((s: { text: string }) => s.text)
    )

  test('undoes a deletion made through the table, and redoes it', async ({ page }) => {
    await loadThreeSegments(page)

    await page.evaluate(() => window.$store.bulkDeleteSegments(['u2']))
    await expectGridCaptionTotal(page, 2, 5000)

    await page.evaluate(() => window.handleMenuUndo())
    await expectGridCaptionTotal(page, 3, 5000)
    expect(await texts(page)).toEqual(['alpha', 'beta', 'gamma'])

    await page.evaluate(() => window.handleMenuRedo())
    await expectGridCaptionTotal(page, 2, 5000)
    expect(await texts(page)).toEqual(['alpha', 'gamma'])
  })

  test('the grid shows the restored row, not just the store', async ({ page }) => {
    await loadThreeSegments(page)
    await page.evaluate(() => window.$store.bulkDeleteSegments(['u1', 'u2']))
    await expectGridCaptionTotal(page, 1, 5000)

    await page.evaluate(() => window.handleMenuUndo())
    await expectGridCaptionTotal(page, 3, 5000)
    await expect(
      page.locator('.ag-center-cols-container .ag-row [col-id="text"]').first()
    ).toContainText('alpha')
  })

  test('undoing back to the saved state clears the unsaved-changes flag', async ({ page }) => {
    await loadThreeSegments(page)
    expect(await page.evaluate(() => window.$store.isDirty)).toBe(false)

    await page.evaluate(() => window.$store.updateSegment('u1', { text: 'changed' }))
    expect(await page.evaluate(() => window.$store.isDirty)).toBe(true)

    await page.evaluate(() => window.handleMenuUndo())
    await expect
      .poll(() => page.evaluate(() => window.$store.isDirty))
      .toBe(false)
  })

  /**
   * The reason this feature needed a real window. With a cell editor focused, Cmd+Z
   * belongs to the text field; the document must not move.
   */
  test('leaves the document alone while a cell editor has focus', async ({ page }) => {
    await loadThreeSegments(page)
    await page.evaluate(() => window.$store.updateSegment('u1', { text: 'edited once' }))
    expect(await texts(page)).toEqual(['edited once', 'beta', 'gamma'])

    await page.evaluate(() => {
      const api = window.__agGridApi!
      api.startEditingCell({ rowIndex: 0, colKey: 'speakerName' })
    })
    const editor = page.locator('.speaker-name-editor')
    await expect(editor).toBeFocused({ timeout: 5000 })

    await page.evaluate(() => window.handleMenuUndo())

    // The document edit is still there: undo went to the focused input, not the store.
    expect(await texts(page)).toEqual(['edited once', 'beta', 'gamma'])
  })

  test('undoes the document once the editor is closed again', async ({ page }) => {
    await loadThreeSegments(page)
    await page.evaluate(() => window.$store.updateSegment('u1', { text: 'edited once' }))

    await page.evaluate(() => {
      const api = window.__agGridApi!
      api.startEditingCell({ rowIndex: 0, colKey: 'speakerName' })
    })
    await expect(page.locator('.speaker-name-editor')).toBeFocused({ timeout: 5000 })
    await page.keyboard.press('Escape')
    await expect(page.locator('.speaker-name-editor')).toHaveCount(0)

    // Focus is back on the grid, so Cmd+Z is the document's again.
    await page.evaluate(() => {
      ;(document.activeElement as HTMLElement | null)?.blur()
      ;window.handleMenuUndo()
    })
    await expect
      .poll(() => page.evaluate(() => window.$store.document.segments[0].text))
      .toBe('alpha')
  })

  test('opening a different document drops the history', async ({ page }) => {
    await loadThreeSegments(page)
    await page.evaluate(() => window.$store.bulkDeleteSegments(['u1']))
    expect(await page.evaluate(() => window.$store.canUndo)).toBe(true)

    await loadThreeSegments(page)
    expect(await page.evaluate(() => window.$store.canUndo)).toBe(false)
  })

  /**
   * The tests above call the renderer handler directly, which skips the half of the
   * wiring that lives in the main process. Clicking the real menu item exercises
   * main -> `menu-undo` IPC -> renderer, which is what Cmd+Z actually does. (Playwright
   * cannot press a native menu accelerator, so clicking the item is as close as it gets.)
   */
  async function clickMenuItem(
    electronApp: import('@playwright/test').ElectronApplication,
    id: string
  ) {
    await electronApp.evaluate(({ Menu }, itemId) => {
      const item = Menu.getApplicationMenu()?.getMenuItemById(itemId)
      if (!item) throw new Error(`no menu item ${itemId}`)
      item.click()
    }, id)
  }

  test('the real Edit > Undo menu item reaches the document', async ({ page, electronApp }) => {
    await loadThreeSegments(page)
    await page.evaluate(() => window.$store.bulkDeleteSegments(['u2']))
    await expectGridCaptionTotal(page, 2, 5000)

    await clickMenuItem(electronApp, 'edit-undo')

    await expectGridCaptionTotal(page, 3, 5000)
    expect(await texts(page)).toEqual(['alpha', 'beta', 'gamma'])

    await clickMenuItem(electronApp, 'edit-redo')
    await expectGridCaptionTotal(page, 2, 5000)
  })

  test('the real menu item leaves the document alone while a cell editor has focus', async ({
    page,
    electronApp,
  }) => {
    await loadThreeSegments(page)
    await page.evaluate(() => window.$store.updateSegment('u1', { text: 'edited once' }))

    await page.evaluate(() => {
      const api = window.__agGridApi!
      api.startEditingCell({ rowIndex: 0, colKey: 'speakerName' })
    })
    await expect(page.locator('.speaker-name-editor')).toBeFocused({ timeout: 5000 })

    await clickMenuItem(electronApp, 'edit-undo')

    // Still there: the whole chain routed undo to the focused input.
    expect(await texts(page)).toEqual(['edited once', 'beta', 'gamma'])
  })

  test('the Edit menu items track whether there is anything to undo', async ({
    page,
    electronApp,
  }) => {
    await loadThreeSegments(page)

    const menuState = () =>
      electronApp.evaluate(({ Menu }) => {
        const menu = Menu.getApplicationMenu()
        return {
          undo: menu?.getMenuItemById('edit-undo')?.enabled ?? null,
          redo: menu?.getMenuItemById('edit-redo')?.enabled ?? null,
        }
      })

    await expect.poll(menuState).toEqual({ undo: false, redo: false })

    await page.evaluate(() => window.$store.updateSegment('u1', { text: 'changed' }))
    await expect.poll(menuState).toEqual({ undo: true, redo: false })

    await page.evaluate(() => window.handleMenuUndo())
    await expect.poll(menuState).toEqual({ undo: false, redo: true })
  })
})
