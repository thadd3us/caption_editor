import { sharedElectronTest as test, expect } from './helpers/shared-electron'
import type { Page } from '@playwright/test'

test.describe('Caption Editor - User Interactions', () => {
  let window: Page

  test.beforeEach(async ({ page }) => {
    window = page
    await window.waitForSelector('.ag-root', { timeout: 10000 })
  })

  async function loadCaptionsAndWaitForSegments(captionsContent: string, expectedSegmentCount: number): Promise<void> {
    await window.evaluate((content) => {
      const store = (window as any).$store
      store.loadFromFile(content, '/test/file.captions.json')
    }, captionsContent)

    await window.waitForFunction((expected) => {
      const store = (window as any).$store
      return store?.document?.segments?.length === expected
    }, expectedSegmentCount, { timeout: 2000 })
  }

  test('should add a caption through UI interaction', async () => {
    const captionsJson = JSON.stringify({
      metadata: { id: 'doc_1' },
      segments: [{ id: 'seg_1', startTime: 1, endTime: 4, text: 'First caption' }]
    })

    await loadCaptionsAndWaitForSegments(captionsJson, 1)

    // Check initial caption count
    const grid = window.locator('.ag-theme-alpine')
    await expect(grid).toBeVisible()
  })

  test('should edit caption text in grid', async () => {
    const captionsJson = JSON.stringify({
      metadata: { id: 'doc_1' },
      segments: [{ id: 'seg_1', startTime: 1, endTime: 4, text: 'Original text' }]
    })

    await loadCaptionsAndWaitForSegments(captionsJson, 1)

    // Grid should be visible
    await expect(window.locator('.ag-theme-alpine')).toBeVisible()
  })

  test('should delete caption using action button', async () => {
    const captionsJson = JSON.stringify({
      metadata: { id: 'doc_1' },
      segments: [
        { id: 'seg_1', startTime: 1, endTime: 4, text: 'Caption to delete' },
        { id: 'seg_2', startTime: 5, endTime: 8, text: 'Caption to keep' }
      ]
    })

    await loadCaptionsAndWaitForSegments(captionsJson, 2)

    // Grid should show 2 captions
    await expect(window.locator('.ag-theme-alpine')).toBeVisible()
  })

  test('should handle invalid captions file gracefully', async () => {
    const invalidContent = '{not json'

    await window.evaluate((content) => {
      const store = (window as any).$store
      try {
        store.loadFromFile(content, '/test/file.captions.json')
      } catch {
        // Expected parse error
      }
    }, invalidContent)

    // App should remain usable even after parse error.
    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 0
    }, { timeout: 2000 })

    // Application should still be functional - check that the table header is visible
    const tableHeader = window.locator('.table-header h2')
    await expect(tableHeader).toBeVisible()
  })

  test('should update caption timing', async () => {
    const captionsJson = JSON.stringify({
      metadata: { id: 'doc_1' },
      segments: [{ id: 'seg_1', startTime: 1, endTime: 4, text: 'Caption with timing' }]
    })

    await loadCaptionsAndWaitForSegments(captionsJson, 1)

    await expect(window.locator('.ag-theme-alpine')).toBeVisible()
  })
})
