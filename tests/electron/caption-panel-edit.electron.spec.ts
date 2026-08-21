import { sharedElectronTest as test, expect } from '../helpers/shared-electron'
import type { Page } from '@playwright/test'

/**
 * Editing the current caption directly in the media panel (below the player), plus the
 * Preferences dialog that governs whether doing so pauses playback.
 *
 * The panel edit commits through the same `store.updateSegment()` path as the table's text
 * column, so the grid must pick the change up reactively.
 */
test.describe('Caption editing in the media panel', () => {
  async function loadDocument(page: Page) {
    const content = JSON.stringify({
      metadata: { id: 'panel-edit-doc' },
      segments: [
        { id: 'seg_a', startTime: 0, endTime: 5, text: 'first caption', verified: false },
        { id: 'seg_b', startTime: 5, endTime: 10, text: 'second caption', verified: false }
      ]
    })
    await page.evaluate((content) => {
      const store = (window as any).$store
      store.loadFromFile(content, '/test/panel-edit-doc.captions_json5')
      store.setCurrentTime(1)
    }, content)
    await page.waitForFunction(() => (window as any).$store?.document?.segments?.length === 2)
    await expect(page.locator('.caption-text')).toContainText('first caption')
  }

  /** Preferences persist in userData, so always restore the default for later tests. */
  async function setPausePreference(page: Page, value: boolean) {
    await page.evaluate((value) => {
      const prefs = (window as any).$preferencesStore
      prefs.setPreference('pausePlaybackWhileEditingCaption', value)
    }, value)
  }

  test('double-click, edit, Enter — updates the document and the table', async ({ page }) => {
    await loadDocument(page)

    await page.locator('.caption-text').dblclick()
    const editor = page.locator('[data-testid="caption-editor"]')
    await expect(editor).toBeVisible()
    await expect(editor).toHaveValue('first caption')

    await editor.fill('edited from the panel')
    await editor.press('Enter')

    await expect(editor).toBeHidden()

    const segment = await page.evaluate(() =>
      (window as any).$store.document.segments.find((s: any) => s.id === 'seg_a')
    )
    expect(segment.text).toBe('edited from the panel')
    expect(segment.verified).toBe(true)

    // The table renders from the same store, so the row reflects the edit.
    await expect(
      page.locator('.ag-center-cols-container .ag-row').filter({ hasText: 'edited from the panel' })
    ).toHaveCount(1)

    // And the panel returns to its read-only word display.
    await expect(page.locator('.caption-text')).toContainText('edited from the panel')
  })

  test('clicking a timed word moves the playhead to it', async ({ page }) => {
    await page.evaluate(() => {
      const store = (window as any).$store
      store.loadFromFile(
        JSON.stringify({
          metadata: { id: 'word-seek-doc' },
          segments: [
            {
              id: 'seg_w',
              startTime: 0,
              endTime: 6,
              text: 'alpha beta gamma',
              words: [
                { text: 'alpha', startTime: 0.5, endTime: 1 },
                { text: 'beta', startTime: 2.25, endTime: 3 },
                { text: 'gamma' }
              ]
            }
          ]
        }),
        '/test/word-seek-doc.captions_json5'
      )
      store.setCurrentTime(0.6)
    })
    await expect(page.locator('.word-span')).toHaveCount(3)

    await page.locator('.word-span').nth(1).click()
    expect(await page.evaluate(() => (window as any).$store.currentTime)).toBe(2.25)

    // The last word has no timestamp, so clicking it must not move the playhead.
    await page.locator('.word-span').nth(2).click()
    expect(await page.evaluate(() => (window as any).$store.currentTime)).toBe(2.25)
  })

  test('Escape discards the edit', async ({ page }) => {
    await loadDocument(page)

    await page.locator('.caption-text').dblclick()
    const editor = page.locator('[data-testid="caption-editor"]')
    await editor.fill('should not be saved')
    await editor.press('Escape')

    await expect(editor).toBeHidden()
    const text = await page.evaluate(() =>
      (window as any).$store.document.segments.find((s: any) => s.id === 'seg_a').text
    )
    expect(text).toBe('first caption')
  })

  test('preferences dialog toggles the pause setting and persists it across a reload', async ({ page }) => {
    await loadDocument(page)
    await setPausePreference(page, false)

    await page.evaluate(() => (window as any).openPreferencesDialog())
    const checkbox = page.locator('[data-testid="pref-pause-while-editing"]')
    await expect(checkbox).toBeVisible()
    await expect(checkbox).not.toBeChecked()

    await checkbox.check()
    await expect(checkbox).toBeChecked()

    // Close the dialog (Done button).
    await page.locator('.base-modal-footer button', { hasText: 'Done' }).click()
    await expect(checkbox).toBeHidden()

    // Written to userData via IPC, so it survives a renderer reload.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => (window as any).$preferencesStore)
    expect(
      await page.evaluate(
        () => (window as any).$preferencesStore.preferences.pausePlaybackWhileEditingCaption
      )
    ).toBe(true)

    // Restore the default so this test does not leak into others.
    await setPausePreference(page, false)
  })
})
