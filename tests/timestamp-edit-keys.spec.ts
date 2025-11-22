import { test, expect, _electron as electron } from '@playwright/test'
import { ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { enableConsoleCapture } from './helpers/console'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

test.describe('Timestamp Editing with +/- Keys', () => {
  let electronApp: ElectronApplication
  let window: Page

  test.beforeAll(async () => {
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

  test.afterAll(async () => {
    await electronApp.close()
  })

  test('should increment start time by 0.1s when pressing + key during edit', async () => {
    // Load a VTT file
    const vttContent = `WEBVTT

00:00:01.000 --> 00:00:04.000
Test caption`

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

    // Find the start time cell (should show "1.000" in simple format)
    const startTimeCell = window.locator('[col-id="startTime"]').first()
    await expect(startTimeCell).toBeVisible()
    await expect(startTimeCell).toContainText('1.000')

    // Double-click to edit
    await startTimeCell.dblclick()
    await window.waitForTimeout(100)

    // Press + key to increment
    await window.keyboard.press('+')
    await window.waitForTimeout(100)

    // The input should now show 1.100
    const input = window.locator('[col-id="startTime"] input').first()
    await expect(input).toHaveValue('1.100')

    // Press Enter to confirm
    await window.keyboard.press('Enter')
    await window.waitForTimeout(100)

    // Verify the cell shows updated value
    await expect(startTimeCell).toContainText('1.100')
  })

  test('should decrement start time by 0.1s when pressing - key during edit', async () => {
    // Load a VTT file
    const vttContent = `WEBVTT

00:00:02.500 --> 00:00:05.000
Test caption`

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

    // Find the start time cell
    const startTimeCell = window.locator('[col-id="startTime"]').first()
    await expect(startTimeCell).toBeVisible()
    await expect(startTimeCell).toContainText('2.500')

    // Double-click to edit
    await startTimeCell.dblclick()
    await window.waitForTimeout(100)

    // Press - key to decrement
    await window.keyboard.press('-')
    await window.waitForTimeout(100)

    // The input should now show 2.400
    const input = window.locator('[col-id="startTime"] input').first()
    await expect(input).toHaveValue('2.400')

    // Press Enter to confirm
    await window.keyboard.press('Enter')
    await window.waitForTimeout(100)

    // Verify the cell shows updated value
    await expect(startTimeCell).toContainText('2.400')
  })

  test('should increment end time by 0.1s when pressing + key during edit', async () => {
    // Load a VTT file
    const vttContent = `WEBVTT

00:00:01.000 --> 00:00:03.000
Test caption`

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

    // Find the end time cell
    const endTimeCell = window.locator('[col-id="endTime"]').first()
    await expect(endTimeCell).toBeVisible()
    await expect(endTimeCell).toContainText('3.000')

    // Double-click to edit
    await endTimeCell.dblclick()
    await window.waitForTimeout(100)

    // Press + key to increment
    await window.keyboard.press('+')
    await window.waitForTimeout(100)

    // The input should now show 3.100
    const input = window.locator('[col-id="endTime"] input').first()
    await expect(input).toHaveValue('3.100')

    // Press Enter to confirm
    await window.keyboard.press('Enter')
    await window.waitForTimeout(100)

    // Verify the cell shows updated value
    await expect(endTimeCell).toContainText('3.100')
  })

  test('should not allow decrementing below 0', async () => {
    // Load a VTT file with start time close to 0
    const vttContent = `WEBVTT

00:00:00.050 --> 00:00:02.000
Test caption`

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

    // Find the start time cell
    const startTimeCell = window.locator('[col-id="startTime"]').first()
    await expect(startTimeCell).toBeVisible()
    await expect(startTimeCell).toContainText('0.050')

    // Double-click to edit
    await startTimeCell.dblclick()
    await window.waitForTimeout(100)

    // Press - key multiple times (should not go below 0)
    await window.keyboard.press('-')
    await window.waitForTimeout(50)

    // Should be 0.000 (clamped at 0)
    const input = window.locator('[col-id="startTime"] input').first()
    await expect(input).toHaveValue('0.000')

    // Press - again, should stay at 0
    await window.keyboard.press('-')
    await window.waitForTimeout(50)
    await expect(input).toHaveValue('0.000')
  })

  test('should support multiple +/- presses in sequence', async () => {
    // Load a VTT file
    const vttContent = `WEBVTT

00:00:05.000 --> 00:00:08.000
Test caption`

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

    // Find the start time cell
    const startTimeCell = window.locator('[col-id="startTime"]').first()
    await expect(startTimeCell).toBeVisible()
    await expect(startTimeCell).toContainText('5.000')

    // Double-click to edit
    await startTimeCell.dblclick()
    await window.waitForTimeout(100)

    const input = window.locator('[col-id="startTime"] input').first()

    // Press + three times (5.0 -> 5.3)
    await window.keyboard.press('+')
    await window.waitForTimeout(50)
    await window.keyboard.press('+')
    await window.waitForTimeout(50)
    await window.keyboard.press('+')
    await window.waitForTimeout(50)

    await expect(input).toHaveValue('5.300')

    // Press - once (5.3 -> 5.2)
    await window.keyboard.press('-')
    await window.waitForTimeout(50)

    await expect(input).toHaveValue('5.200')

    // Confirm the edit
    await window.keyboard.press('Enter')
    await window.waitForTimeout(100)

    // Verify final value
    await expect(startTimeCell).toContainText('5.200')
  })

  test('should display times in simple seconds format (ssss.000)', async () => {
    // Load a VTT file with times that would be shown differently in HH:MM:SS format
    const vttContent = `WEBVTT

00:01:30.500 --> 00:02:45.750
Caption at 90.5 seconds`

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

    // Verify times are displayed in simple format
    const startTimeCell = window.locator('[col-id="startTime"]').first()
    const endTimeCell = window.locator('[col-id="endTime"]').first()

    // Should show 90.500, not 00:01:30.500
    await expect(startTimeCell).toContainText('90.500')

    // Should show 165.750, not 00:02:45.750
    await expect(endTimeCell).toContainText('165.750')
  })
})
