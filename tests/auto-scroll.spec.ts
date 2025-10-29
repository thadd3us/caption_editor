import { test, expect } from '@playwright/test'
import * as path from 'path'

test.describe('Auto-scroll functionality', () => {
  test('should auto-scroll table as playhead moves through 100 cues', async ({ page }) => {
    await page.goto('/')

    // Clear any existing data
    const clearButton = page.locator('button', { hasText: 'Clear' })
    if (await clearButton.isVisible()) {
      await clearButton.click()
      const dialog = page.locator('text=Are you sure')
      if (await dialog.isVisible()) {
        await page.locator('button', { hasText: 'OK' }).click()
      }
    }

    // Load the 100-cue VTT file and 100-second silent audio
    const vttPath = path.join(process.cwd(), 'tests', 'fixtures', '100-cues.vtt')
    const audioPath = path.join(process.cwd(), 'tests', 'fixtures', '100s-silence.flac')

    console.log('Loading VTT file:', vttPath)
    console.log('Loading audio file:', audioPath)

    // Open file dialog and select both files
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles([vttPath, audioPath])

    // Wait for files to load
    await page.waitForTimeout(500)

    // Verify 100 rows are loaded
    const captionHeader = page.locator('h2', { hasText: 'Captions' })
    await expect(captionHeader).toContainText('100')
    console.log('100 cues loaded successfully')

    // Enable auto-scroll
    const autoScrollCheckbox = page.locator('input[type="checkbox"]').nth(1) // Second checkbox
    await autoScrollCheckbox.check()
    await expect(autoScrollCheckbox).toBeChecked()
    console.log('Auto-scroll enabled')

    // Get the audio/video element
    const mediaElement = page.locator('audio, video')
    await expect(mediaElement).toBeVisible()

    // Test 1: Seek to second 10 and verify row 10 is scrolled to top and selected
    await mediaElement.evaluate((el: HTMLMediaElement) => {
      el.currentTime = 10.5
    })
    await page.waitForTimeout(200)

    let selectedRow = page.locator('.ag-row-selected')
    await expect(selectedRow).toBeVisible()
    let selectedText = await selectedRow.locator('.ag-cell[col-id="text"]').textContent()
    expect(selectedText).toBe('10')
    console.log('✓ Seeked to 10s: Row 10 is selected')

    // Test 2: Seek to second 50
    await mediaElement.evaluate((el: HTMLMediaElement) => {
      el.currentTime = 50.5
    })
    await page.waitForTimeout(200)

    selectedRow = page.locator('.ag-row-selected')
    selectedText = await selectedRow.locator('.ag-cell[col-id="text"]').textContent()
    expect(selectedText).toBe('50')
    console.log('✓ Seeked to 50s: Row 50 is selected')

    // Test 3: Seek to second 99
    await mediaElement.evaluate((el: HTMLMediaElement) => {
      el.currentTime = 99.5
    })
    await page.waitForTimeout(200)

    selectedRow = page.locator('.ag-row-selected')
    selectedText = await selectedRow.locator('.ag-cell[col-id="text"]').textContent()
    expect(selectedText).toBe('99')
    console.log('✓ Seeked to 99s: Row 99 is selected')

    // Test 4: Seek back to second 25
    await mediaElement.evaluate((el: HTMLMediaElement) => {
      el.currentTime = 25.5
    })
    await page.waitForTimeout(200)

    selectedRow = page.locator('.ag-row-selected')
    selectedText = await selectedRow.locator('.ag-cell[col-id="text"]').textContent()
    expect(selectedText).toBe('25')
    console.log('✓ Seeked to 25s: Row 25 is selected')

    // Test 5: Verify auto-scroll can be disabled
    await autoScrollCheckbox.uncheck()
    await expect(autoScrollCheckbox).not.toBeChecked()

    const previousSelectedText = selectedText
    await mediaElement.evaluate((el: HTMLMediaElement) => {
      el.currentTime = 75.5
    })
    await page.waitForTimeout(200)

    selectedRow = page.locator('.ag-row-selected')
    selectedText = await selectedRow.locator('.ag-cell[col-id="text"]').textContent()
    // Should still show row 25 since auto-scroll is disabled
    expect(selectedText).toBe(previousSelectedText)
    console.log('✓ Auto-scroll disabled: Selection did not change')

    // Test 6: Re-enable and verify it works again
    await autoScrollCheckbox.check()
    // Need to trigger the watch by slightly changing the time
    await mediaElement.evaluate((el: HTMLMediaElement) => {
      el.currentTime = 75.6
    })
    await page.waitForTimeout(200)

    selectedRow = page.locator('.ag-row-selected')
    selectedText = await selectedRow.locator('.ag-cell[col-id="text"]').textContent()
    expect(selectedText).toBe('75')
    console.log('✓ Auto-scroll re-enabled: Row 75 is selected')

    console.log('✅ All auto-scroll tests passed!')
  })

  test('should not trigger autoplay when auto-scrolling', async ({ page }) => {
    await page.goto('/')

    // Load the test files
    const vttPath = path.join(process.cwd(), 'tests', 'fixtures', '100-cues.vtt')
    const audioPath = path.join(process.cwd(), 'tests', 'fixtures', '100s-silence.flac')

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles([vttPath, audioPath])
    await page.waitForTimeout(500)

    // Enable both autoplay and auto-scroll
    const autoplayCheckbox = page.locator('input[type="checkbox"]').nth(0)
    const autoScrollCheckbox = page.locator('input[type="checkbox"]').nth(1)

    await autoplayCheckbox.check()
    await autoScrollCheckbox.check()

    console.log('Both autoplay and auto-scroll enabled')

    // Get the media element
    const mediaElement = page.locator('audio, video')

    // Ensure media is paused initially
    const isPaused = await mediaElement.evaluate((el: HTMLMediaElement) => el.paused)
    expect(isPaused).toBe(true)
    console.log('Media is paused')

    // Seek to second 30 (this should trigger auto-scroll but NOT autoplay)
    await mediaElement.evaluate((el: HTMLMediaElement) => {
      el.currentTime = 30.5
    })
    await page.waitForTimeout(300)

    // Verify row is selected
    const selectedRow = page.locator('.ag-row-selected')
    const selectedText = await selectedRow.locator('.ag-cell[col-id="text"]').textContent()
    expect(selectedText).toBe('30')

    // Verify media is still paused (autoplay should not have triggered)
    const stillPaused = await mediaElement.evaluate((el: HTMLMediaElement) => el.paused)
    expect(stillPaused).toBe(true)

    console.log('✓ Auto-scroll selected row without triggering autoplay')
    console.log('✅ Autoplay suppression test passed!')
  })
})
