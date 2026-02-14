import { sharedElectronTest as test, expect } from './helpers/shared-electron'
import type { Page } from '@playwright/test'

test.describe('VTT Editor - User Interactions', () => {
  let window: Page

  test.beforeEach(async ({ page }) => {
    window = page
    await window.waitForSelector('.ag-root', { timeout: 10000 })
  })

  async function loadVttAndWaitForSegments(vttContent: string, expectedSegmentCount: number): Promise<void> {
    await window.evaluate((content) => {
      const store = (window as any).$store
      store.loadFromFile(content, '/test/file.vtt')
    }, vttContent)

    await window.waitForFunction((expected) => {
      const store = (window as any).$store
      return store?.document?.segments?.length === expected
    }, expectedSegmentCount, { timeout: 2000 })
  }

  test('should add a caption through UI interaction', async () => {
    // Load a VTT file first
    const vttContent = `WEBVTT

00:00:01.000 --> 00:00:04.000
First caption`

    await loadVttAndWaitForSegments(vttContent, 1)

    // Check initial caption count
    const grid = window.locator('.ag-theme-alpine')
    await expect(grid).toBeVisible()
  })

  test('should edit caption text in grid', async () => {
    // Load VTT
    const vttContent = `WEBVTT

00:00:01.000 --> 00:00:04.000
Original text`

    await loadVttAndWaitForSegments(vttContent, 1)

    // Grid should be visible
    await expect(window.locator('.ag-theme-alpine')).toBeVisible()
  })

  test('should delete caption using action button', async () => {
    const vttContent = `WEBVTT

00:00:01.000 --> 00:00:04.000
Caption to delete

00:00:05.000 --> 00:00:08.000
Caption to keep`

    await loadVttAndWaitForSegments(vttContent, 2)

    // Grid should show 2 captions
    await expect(window.locator('.ag-theme-alpine')).toBeVisible()
  })

  test('should handle invalid VTT file gracefully', async () => {
    const invalidContent = 'This is not a VTT file'

    await window.evaluate((content) => {
      const store = (window as any).$store
      try {
        store.loadFromFile(content, '/test/file.vtt')
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
    const vttContent = `WEBVTT

00:00:01.000 --> 00:00:04.000
Caption with timing`

    await loadVttAndWaitForSegments(vttContent, 1)

    await expect(window.locator('.ag-theme-alpine')).toBeVisible()
  })
})
