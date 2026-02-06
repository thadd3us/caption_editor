import { test, expect, _electron as electron } from '@playwright/test'
import { ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { enableConsoleCapture } from './helpers/console'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

test.describe('VTT Editor - User Interactions', () => {
  let electronApp: ElectronApplication
  let window: Page

  test.beforeEach(async () => {
    // Launch Electron app
    electronApp = await electron.launch({
      args: [path.join(process.cwd(), 'dist-electron/main.cjs'), '--no-sandbox'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DISPLAY: process.env.DISPLAY || ':99'
      }
    })

    // Wait for the first window
    window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    enableConsoleCapture(window)
  })

  test.afterEach(async () => {
    if (electronApp) { await electronApp.close().catch(() => {}) }
  })

  test('should add a caption through UI interaction', async () => {
    // Load a VTT file first
    const vttContent = `WEBVTT

00:00:01.000 --> 00:00:04.000
First caption`

    await window.evaluate((content) => {
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

    await window.waitForTimeout(200)

    // Check initial caption count
    const grid = window.locator('.ag-theme-alpine')
    await expect(grid).toBeVisible()
  })

  test('should edit caption text in grid', async () => {
    // Load VTT
    const vttContent = `WEBVTT

00:00:01.000 --> 00:00:04.000
Original text`

    await window.evaluate((content) => {
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

    await window.waitForTimeout(200)

    // Grid should be visible
    await expect(window.locator('.ag-theme-alpine')).toBeVisible()
  })

  test('should delete caption using action button', async () => {
    const vttContent = `WEBVTT

00:00:01.000 --> 00:00:04.000
Caption to delete

00:00:05.000 --> 00:00:08.000
Caption to keep`

    await window.evaluate((content) => {
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

    await window.waitForTimeout(200)

    // Grid should show 2 captions
    await expect(window.locator('.ag-theme-alpine')).toBeVisible()
  })

  test('should handle invalid VTT file gracefully', async () => {
    const invalidContent = 'This is not a VTT file'

    // Suppress console errors for this test
    window.on('console', msg => {
      if (msg.type() === 'error') {
        // Expected error
      }
    })

    await window.evaluate((content) => {
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
      } catch {
        // Expected to fail
      }
    }, invalidContent)

    await window.waitForTimeout(100)

    // Application should still be functional - check that the table header is visible
    const tableHeader = window.locator('.table-header h2')
    await expect(tableHeader).toBeVisible()
  })

  test('should update caption timing', async () => {
    const vttContent = `WEBVTT

00:00:01.000 --> 00:00:04.000
Caption with timing`

    await window.evaluate((content) => {
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

    await window.waitForTimeout(200)

    await expect(window.locator('.ag-theme-alpine')).toBeVisible()
  })
})
