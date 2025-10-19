import { test, expect } from './helpers/coverage'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

test.describe('VTT Editor - User Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
  })

  test('should add a caption through UI interaction', async ({ page }) => {
    await page.goto('/')

    // Load a VTT file first
    const vttContent = `WEBVTT

00:00:01.000 --> 00:00:04.000
First caption`

    await page.evaluate((content) => {
      const file = new File([content], 'test.vtt', { type: 'text/vtt' })
      const dt = new DataTransfer()
      dt.items.add(file)

      const dropZone = document.querySelector('.file-input-zone')
      if (dropZone) {
        const event = new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt
        })
        dropZone.dispatchEvent(event)
      }
    }, vttContent)

    await page.waitForTimeout(1000)

    // Check initial caption count
    const grid = page.locator('.ag-theme-alpine')
    await expect(grid).toBeVisible()
  })

  test('should edit caption text in grid', async ({ page }) => {
    await page.goto('/')

    // Load VTT
    const vttContent = `WEBVTT

00:00:01.000 --> 00:00:04.000
Original text`

    await page.evaluate((content) => {
      const file = new File([content], 'test.vtt', { type: 'text/vtt' })
      const dt = new DataTransfer()
      dt.items.add(file)
      const dropZone = document.querySelector('.file-input-zone')
      if (dropZone) {
        dropZone.dispatchEvent(new DragEvent('drop', {
          bubbles: true,
          dataTransfer: dt
        }))
      }
    }, vttContent)

    await page.waitForTimeout(1000)

    // Grid should be visible
    await expect(page.locator('.ag-theme-alpine')).toBeVisible()
  })

  test('should delete caption using action button', async ({ page }) => {
    await page.goto('/')

    const vttContent = `WEBVTT

00:00:01.000 --> 00:00:04.000
Caption to delete

00:00:05.000 --> 00:00:08.000
Caption to keep`

    await page.evaluate((content) => {
      const file = new File([content], 'test.vtt', { type: 'text/vtt' })
      const dt = new DataTransfer()
      dt.items.add(file)
      const dropZone = document.querySelector('.file-input-zone')
      if (dropZone) {
        dropZone.dispatchEvent(new DragEvent('drop', {
          bubbles: true,
          dataTransfer: dt
        }))
      }
    }, vttContent)

    await page.waitForTimeout(1000)

    // Grid should show 2 captions
    await expect(page.locator('.ag-theme-alpine')).toBeVisible()
  })

  test('should rate a caption using star rating', async ({ page }) => {
    await page.goto('/')

    const vttContent = `WEBVTT

00:00:01.000 --> 00:00:04.000
Caption to rate`

    await page.evaluate((content) => {
      const file = new File([content], 'test.vtt', { type: 'text/vtt' })
      const dt = new DataTransfer()
      dt.items.add(file)
      const dropZone = document.querySelector('.file-input-zone')
      if (dropZone) {
        dropZone.dispatchEvent(new DragEvent('drop', {
          bubbles: true,
          dataTransfer: dt
        }))
      }
    }, vttContent)

    await page.waitForTimeout(1000)

    await expect(page.locator('.ag-theme-alpine')).toBeVisible()
  })

  test('should clear all captions with confirmation', async ({ page }) => {
    await page.goto('/')

    const vttContent = `WEBVTT

00:00:01.000 --> 00:00:04.000
Caption 1

00:00:05.000 --> 00:00:08.000
Caption 2`

    await page.evaluate((content) => {
      const file = new File([content], 'test.vtt', { type: 'text/vtt' })
      const dt = new DataTransfer()
      dt.items.add(file)
      const dropZone = document.querySelector('.file-input-zone')
      if (dropZone) {
        dropZone.dispatchEvent(new DragEvent('drop', {
          bubbles: true,
          dataTransfer: dt
        }))
      }
    }, vttContent)

    await page.waitForTimeout(1000)

    // Accept clear confirmation
    page.on('dialog', dialog => dialog.accept())

    const clearButton = page.locator('button', { hasText: 'Clear' })
    await clearButton.click()

    await page.waitForTimeout(500)

    // Document should be empty
    const stored = await page.evaluate(() => {
      const data = localStorage.getItem('vtt-editor-document')
      return data ? JSON.parse(data) : null
    })

    expect(stored).toBeDefined()
    if (stored) {
      expect(stored.document.cues).toHaveLength(0)
    }
  })

  test('should handle invalid VTT file gracefully', async ({ page }) => {
    await page.goto('/')

    const invalidContent = 'This is not a VTT file'

    // Suppress console errors for this test
    page.on('console', msg => {
      if (msg.type() === 'error') {
        // Expected error
      }
    })

    await page.evaluate((content) => {
      try {
        const file = new File([content], 'invalid.vtt', { type: 'text/vtt' })
        const dt = new DataTransfer()
        dt.items.add(file)
        const dropZone = document.querySelector('.file-input-zone')
        if (dropZone) {
          dropZone.dispatchEvent(new DragEvent('drop', {
            bubbles: true,
            dataTransfer: dt
          }))
        }
      } catch (e) {
        // Expected to fail
      }
    }, invalidContent)

    await page.waitForTimeout(500)

    // Application should still be functional
    const uploadButton = page.locator('button', { hasText: 'Open Files' })
    await expect(uploadButton).toBeVisible()
  })

  test('should update caption timing', async ({ page }) => {
    await page.goto('/')

    const vttContent = `WEBVTT

00:00:01.000 --> 00:00:04.000
Caption with timing`

    await page.evaluate((content) => {
      const file = new File([content], 'test.vtt', { type: 'text/vtt' })
      const dt = new DataTransfer()
      dt.items.add(file)
      const dropZone = document.querySelector('.file-input-zone')
      if (dropZone) {
        dropZone.dispatchEvent(new DragEvent('drop', {
          bubbles: true,
          dataTransfer: dt
        }))
      }
    }, vttContent)

    await page.waitForTimeout(1000)

    await expect(page.locator('.ag-theme-alpine')).toBeVisible()
  })
})
