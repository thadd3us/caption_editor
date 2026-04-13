import { sharedElectronTest as test, expect } from './helpers/shared-electron'
import type { Page } from '@playwright/test'

/**
 * Documents intended “Lightroom-style” targeting: multi-select + actions keyed to
 * whether the gesture row is inside or outside the selection.
 *
 * Tests marked with test.fail() expect the assertion to fail on the current
 * implementation; they pass as long as the bug is present. Remove test.fail()
 * when the behavior is fixed.
 */
test.describe('Selection targeting (Lightroom-style)', () => {
  let window: Page

  test.beforeEach(async ({ page }) => {
    window = page
    await window.waitForSelector('.ag-root', { timeout: 10000 })
  })

  test.afterEach(async () => {
    await window
      .evaluate(() => {
        const overlay = document.querySelector('.context-menu-overlay')
        if (overlay) (overlay as HTMLElement).click()
      })
      .catch(() => {})
  })

  test('verified toggle applies to all selected rows when clicking inside selection', async () => {
    await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return
      const captionsContent = JSON.stringify(
        {
          metadata: { id: 'sel-target-verify-ok' },
          segments: [
            { id: 'a', startTime: 1, endTime: 2, text: 'One', verified: false },
            { id: 'b', startTime: 3, endTime: 4, text: 'Two', verified: false },
            { id: 'c', startTime: 5, endTime: 6, text: 'Three', verified: false }
          ]
        },
        null,
        2
      )
      store.loadFromFile(captionsContent, '/test/sel-target.captions_json5')
    })

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 3
    })

    await window.waitForSelector('.ag-center-cols-container .ag-row', { timeout: 5000 })

    const row0 = window.locator('.ag-center-cols-container .ag-row[row-index="0"]')
    const row1 = window.locator('.ag-center-cols-container .ag-row[row-index="1"]')
    await row0.click()
    await row1.click({ modifiers: ['Shift'] })
    await window.waitForTimeout(150)

    const checkRow0 = row0.locator('[col-id="verified"] .verified-check')
    await checkRow0.click()

    const verified = await window.evaluate(() => {
      const store = (window as any).$store
      return store.document.segments.map((s: any) => ({ id: s.id, verified: s.verified }))
    })

    expect(verified.find((s: { id: string }) => s.id === 'a')?.verified).toBe(true)
    expect(verified.find((s: { id: string }) => s.id === 'b')?.verified).toBe(true)
    expect(verified.find((s: { id: string }) => s.id === 'c')?.verified).toBeFalsy()
  })

  test('star rating applies to all selected rows when clicking a star inside selection', async () => {
    test.fail(true, 'StarRatingCell ignores multi-select; should match VerifiedCheckCell / CLAUDE.md')

    await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return
      const captionsContent = JSON.stringify(
        {
          metadata: { id: 'sel-target-star' },
          segments: [
            { id: 'a', startTime: 1, endTime: 2, text: 'One' },
            { id: 'b', startTime: 3, endTime: 4, text: 'Two' },
            { id: 'c', startTime: 5, endTime: 6, text: 'Three' }
          ]
        },
        null,
        2
      )
      store.loadFromFile(captionsContent, '/test/sel-target.captions_json5')
    })

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 3
    })

    await window.waitForSelector('.ag-center-cols-container .ag-row', { timeout: 5000 })

    const row0 = window.locator('.ag-center-cols-container .ag-row[row-index="0"]')
    const row1 = window.locator('.ag-center-cols-container .ag-row[row-index="1"]')
    await row0.click()
    await row1.click({ modifiers: ['Shift'] })
    await window.waitForTimeout(150)

    await row0.locator('.star-rating [data-star-index="5"]').click()

    const ratings = await window.evaluate(() => {
      const store = (window as any).$store
      return store.document.segments.map((s: any) => ({ id: s.id, rating: s.rating }))
    })

    expect(ratings.find((s: { id: string }) => s.id === 'a')?.rating).toBe(5)
    expect(ratings.find((s: { id: string }) => s.id === 'b')?.rating).toBe(5)
    expect(ratings.find((s: { id: string }) => s.id === 'c')?.rating).toBeFalsy()
  })

  test('context menu delete targets only right-clicked row when that row is outside selection', async () => {
    test.fail(
      true,
      'onCellContextMenu uses getSelectedRows() only; ignores row under pointer — see CLAUDE.md'
    )

    await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return
      const captionsContent = JSON.stringify(
        {
          metadata: { id: 'sel-target-ctx-delete' },
          segments: [
            { id: 'a', startTime: 1, endTime: 2, text: 'One' },
            { id: 'b', startTime: 3, endTime: 4, text: 'Two' },
            { id: 'c', startTime: 5, endTime: 6, text: 'Three' }
          ]
        },
        null,
        2
      )
      store.loadFromFile(captionsContent, '/test/sel-target.captions_json5')
    })

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 3
    })

    await window.waitForSelector('.ag-center-cols-container .ag-row', { timeout: 5000 })

    const row0 = window.locator('.ag-center-cols-container .ag-row[row-index="0"]')
    const row1 = window.locator('.ag-center-cols-container .ag-row[row-index="1"]')
    await row0.click()
    await row1.click({ modifiers: ['Shift'] })
    await window.waitForTimeout(150)

    const row2Text = window.locator('.ag-center-cols-container .ag-row[row-index="2"] [col-id="text"]')
    await row2Text.click({ button: 'right' })

    await expect(window.locator('.context-menu')).toBeVisible({ timeout: 5000 })

    await window.locator('.context-menu-item', { hasText: 'Delete Selected' }).click()

    const deleteDialog = window.locator('.base-modal').filter({ hasText: 'Delete Selected Rows' })
    await expect(deleteDialog).toBeVisible()
    await expect(deleteDialog).toContainText('delete 1 row')

    await deleteDialog.locator('button.dialog-button-secondary').click()
    await expect(deleteDialog).not.toBeVisible()
  })

  test('context menu delete still targets full selection when right-click is inside selection', async () => {
    await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return
      const captionsContent = JSON.stringify(
        {
          metadata: { id: 'sel-target-ctx-delete-inside' },
          segments: [
            { id: 'a', startTime: 1, endTime: 2, text: 'One' },
            { id: 'b', startTime: 3, endTime: 4, text: 'Two' },
            { id: 'c', startTime: 5, endTime: 6, text: 'Three' }
          ]
        },
        null,
        2
      )
      store.loadFromFile(captionsContent, '/test/sel-target.captions_json5')
    })

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 3
    })

    await window.waitForSelector('.ag-center-cols-container .ag-row', { timeout: 5000 })

    const row0 = window.locator('.ag-center-cols-container .ag-row[row-index="0"]')
    const row1 = window.locator('.ag-center-cols-container .ag-row[row-index="1"]')
    await row0.click()
    await row1.click({ modifiers: ['Shift'] })
    await window.waitForTimeout(150)

    const row1Text = window.locator('.ag-center-cols-container .ag-row[row-index="1"] [col-id="text"]')
    await row1Text.click({ button: 'right' })

    await expect(window.locator('.context-menu')).toBeVisible({ timeout: 5000 })

    await window.locator('.context-menu-item', { hasText: 'Delete Selected' }).click()

    const deleteDialog = window.locator('.base-modal').filter({ hasText: 'Delete Selected Rows' })
    await expect(deleteDialog).toBeVisible()
    await expect(deleteDialog).toContainText('delete 2 rows')

    await deleteDialog.locator('button.dialog-button-secondary').click()
    await expect(deleteDialog).not.toBeVisible()
  })

  test('context menu enables speaker similarity when right-clicked row has embedding but selection does not', async () => {
    test.fail(
      true,
      'hasAnyEmbedding uses selection only; should consider context row under pointer — see CLAUDE.md'
    )

    await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return
      const floats = new Float32Array([1, 0, 0, 0])
      const bytes = new Uint8Array(floats.buffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      const speakerEmbedding = btoa(binary)

      const captionsContent = JSON.stringify(
        {
          metadata: { id: 'sel-target-ctx-emb' },
          segments: [
            { id: 'a', startTime: 1, endTime: 2, text: 'One' },
            { id: 'b', startTime: 3, endTime: 4, text: 'Two' },
            { id: 'c', startTime: 5, endTime: 6, text: 'Three' }
          ],
          embeddings: [{ segmentId: 'c', speakerEmbedding }]
        },
        null,
        2
      )
      store.loadFromFile(captionsContent, '/test/sel-target.captions_json5')
    })

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 3 && (store.document.embeddings?.length ?? 0) >= 1
    })

    await window.waitForSelector('.ag-center-cols-container .ag-row', { timeout: 5000 })

    const row0 = window.locator('.ag-center-cols-container .ag-row[row-index="0"]')
    const row1 = window.locator('.ag-center-cols-container .ag-row[row-index="1"]')
    await row0.click()
    await row1.click({ modifiers: ['Shift'] })
    await window.waitForTimeout(150)

    const row2Text = window.locator('.ag-center-cols-container .ag-row[row-index="2"] [col-id="text"]')
    await row2Text.click({ button: 'right' })

    await expect(window.locator('.context-menu')).toBeVisible({ timeout: 5000 })

    const sortItem = window.locator('.context-menu-item', { hasText: 'Sort Rows by Speaker Similarity' })
    await expect(sortItem).not.toHaveClass(/disabled/)
  })
})
