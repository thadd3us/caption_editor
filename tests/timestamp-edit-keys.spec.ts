import { sharedElectronTest as test, expect } from './helpers/shared-electron'
import type { Locator, Page } from '@playwright/test'

async function loadCaptionsAndWaitForFirstRow(page: Page, captionsContent: string): Promise<void> {
  await page.evaluate((content) => {
    const store = (window as any).$store
    store.loadFromFile(content, '/test/test.captions.json')
  }, captionsContent)

  // Wait for store + grid to reflect the new document (avoid race vs AG Grid render).
  await page.waitForFunction(() => {
    const store = (window as any).$store
    return Array.isArray(store?.document?.segments) && store.document.segments.length > 0
  })

  await page.waitForFunction(() => {
    const firstStartTimeCell = document.querySelector('.ag-cell[col-id="startTime"]')
    return !!firstStartTimeCell
  })
}

async function firstCell(page: Page, colId: 'startTime' | 'endTime'): Promise<Locator> {
  const cell = page.locator(`.ag-cell[col-id="${colId}"]`).first()
  await expect(cell).toBeVisible()
  return cell
}

async function enterTimestampEditMode(
  page: Page,
  colId: 'startTime' | 'endTime',
  expectedInitialValue: string
): Promise<Locator> {
  const attachedLog = `Attached +/- key handler to ${colId} input`
  const waitForHandler = page.waitForEvent('console', {
    predicate: (msg) => msg.text().includes(attachedLog)
  })

  const cell = await firstCell(page, colId)
  await cell.dblclick()

  const input = page.locator(`.ag-cell[col-id="${colId}"] input`).first()
  await expect(input).toBeVisible()
  await expect(input).toHaveValue(expectedInitialValue)

  // Ensure the app's +/- key handler is attached before pressing keys.
  await waitForHandler
  return input
}

test.describe('Timestamp Editing with +/- Keys', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure AG Grid is mounted before any cell access.
    await page.waitForSelector('.ag-root', { timeout: 10000 })
  })

  test('should increment start time by 0.1s when pressing + key during edit', async ({ page }) => {
    const window = page
    const captionsJson = JSON.stringify({
      metadata: { id: 'doc_1' },
      segments: [{ id: 'seg_1', startTime: 1.0, endTime: 4.0, text: 'Test caption' }]
    })

    await loadCaptionsAndWaitForFirstRow(window, captionsJson)

    // Find the start time cell (should show "1.000" in simple format)
    // Use ag-cell to target data cells, not header cells
    const startTimeCell = await firstCell(window, 'startTime')
    await expect(startTimeCell).toContainText('1.000')

    // Double-click to edit
    const input = await enterTimestampEditMode(window, 'startTime', '1.000')

    // Press + key to increment
    await window.keyboard.press('+')

    // The input should now show 1.100
    await expect(input).toHaveValue('1.100')

    // Press Enter to confirm
    await window.keyboard.press('Enter')

    // Verify the cell shows updated value
    await expect(startTimeCell).toContainText('1.100')
  })

  test('should decrement start time by 0.1s when pressing - key during edit', async ({ page }) => {
    const window = page
    const captionsJson = JSON.stringify({
      metadata: { id: 'doc_1' },
      segments: [{ id: 'seg_1', startTime: 2.5, endTime: 5.0, text: 'Test caption' }]
    })

    await loadCaptionsAndWaitForFirstRow(window, captionsJson)

    // Find the start time cell
    const startTimeCell = await firstCell(window, 'startTime')
    await expect(startTimeCell).toContainText('2.500')

    // Double-click to edit
    const input = await enterTimestampEditMode(window, 'startTime', '2.500')

    // Press - key to decrement
    await window.keyboard.press('-')

    // The input should now show 2.400
    await expect(input).toHaveValue('2.400')

    // Press Enter to confirm
    await window.keyboard.press('Enter')

    // Verify the cell shows updated value
    await expect(startTimeCell).toContainText('2.400')
  })

  test('should increment end time by 0.1s when pressing + key during edit', async ({ page }) => {
    const window = page
    const captionsJson = JSON.stringify({
      metadata: { id: 'doc_1' },
      segments: [{ id: 'seg_1', startTime: 1.0, endTime: 3.0, text: 'Test caption' }]
    })

    await loadCaptionsAndWaitForFirstRow(window, captionsJson)

    // Find the end time cell
    const endTimeCell = await firstCell(window, 'endTime')
    await expect(endTimeCell).toContainText('3.000')

    // Double-click to edit
    const input = await enterTimestampEditMode(window, 'endTime', '3.000')

    // Press + key to increment
    await window.keyboard.press('+')

    // The input should now show 3.100
    await expect(input).toHaveValue('3.100')

    // Press Enter to confirm
    await window.keyboard.press('Enter')

    // Verify the cell shows updated value
    await expect(endTimeCell).toContainText('3.100')
  })

  test('should not allow decrementing below 0', async ({ page }) => {
    const window = page
    const captionsJson = JSON.stringify({
      metadata: { id: 'doc_1' },
      segments: [{ id: 'seg_1', startTime: 0.05, endTime: 2.0, text: 'Test caption' }]
    })

    await loadCaptionsAndWaitForFirstRow(window, captionsJson)

    // Find the start time cell
    const startTimeCell = await firstCell(window, 'startTime')
    await expect(startTimeCell).toContainText('0.050')

    // Double-click to edit
    const input = await enterTimestampEditMode(window, 'startTime', '0.050')

    // Press - key multiple times (should not go below 0)
    await window.keyboard.press('-')

    // Should be 0.000 (clamped at 0)
    await expect(input).toHaveValue('0.000')

    // Press - again, should stay at 0
    await window.keyboard.press('-')
    await expect(input).toHaveValue('0.000')
  })

  test('should support multiple +/- presses in sequence', async ({ page }) => {
    const window = page
    const captionsJson = JSON.stringify({
      metadata: { id: 'doc_1' },
      segments: [{ id: 'seg_1', startTime: 5.0, endTime: 8.0, text: 'Test caption' }]
    })

    await loadCaptionsAndWaitForFirstRow(window, captionsJson)

    // Find the start time cell
    const startTimeCell = await firstCell(window, 'startTime')
    await expect(startTimeCell).toContainText('5.000')

    // Double-click to edit
    const input = await enterTimestampEditMode(window, 'startTime', '5.000')

    // Press + three times (5.0 -> 5.3)
    await window.keyboard.press('+')
    await window.keyboard.press('+')
    await window.keyboard.press('+')

    await expect(input).toHaveValue('5.300')

    // Press - once (5.3 -> 5.2)
    await window.keyboard.press('-')

    await expect(input).toHaveValue('5.200')

    // Confirm the edit
    await window.keyboard.press('Enter')

    // Verify final value
    await expect(startTimeCell).toContainText('5.200')
  })

  test('should display times in simple seconds format (ssss.000)', async ({ page }) => {
    const window = page
    const captionsJson = JSON.stringify({
      metadata: { id: 'doc_1' },
      segments: [{ id: 'seg_1', startTime: 90.5, endTime: 165.75, text: 'Caption at 90.5 seconds' }]
    })

    await loadCaptionsAndWaitForFirstRow(window, captionsJson)

    // Verify times are displayed in simple format
    const startTimeCell = await firstCell(window, 'startTime')
    const endTimeCell = await firstCell(window, 'endTime')

    // Should show 90.500, not 00:01:30.500
    await expect(startTimeCell).toContainText('90.500')

    // Should show 165.750, not 00:02:45.750
    await expect(endTimeCell).toContainText('165.750')
  })
})
