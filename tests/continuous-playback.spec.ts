import { test, expect } from '@playwright/test'
import * as path from 'path'

test.describe('Continuous playback with auto-scroll', () => {
  test('should play continuously through multiple cues without stopping', async ({ page }) => {
    await page.goto('/')

    // Load the 100-cue VTT file and 100-second silent audio
    const vttPath = path.join(process.cwd(), 'tests', 'fixtures', '100-cues.vtt')
    const audioPath = path.join(process.cwd(), 'tests', 'fixtures', '100s-silence.flac')

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles([vttPath, audioPath])
    await page.waitForTimeout(500)

    console.log('Files loaded')

    // Enable auto-scroll
    const autoScrollCheckbox = page.locator('input[type="checkbox"]').nth(1)
    await autoScrollCheckbox.check()
    console.log('Auto-scroll enabled')

    // Get the media element
    const mediaElement = page.locator('audio, video')

    // Start playing from second 0 using the main play button
    const playButton = page.locator('button.control-btn', { hasText: '▶️' })
    await playButton.click()

    console.log('Started playback')

    // Wait a bit and verify we're still playing (not stopped at 1 second)
    await page.waitForTimeout(1500)

    const currentTime1 = await mediaElement.evaluate((el: HTMLMediaElement) => el.currentTime)
    const isPlaying1 = await mediaElement.evaluate((el: HTMLMediaElement) => !el.paused)

    console.log('After 1.5s: currentTime =', currentTime1, 'playing =', isPlaying1)
    expect(isPlaying1).toBe(true)
    expect(currentTime1).toBeGreaterThan(1.0)  // Should have passed the first segment

    // Verify row 1 is now selected (auto-scroll working)
    let selectedRow = page.locator('.ag-row-selected')
    let selectedText = await selectedRow.locator('.ag-cell[col-id="text"]').textContent()
    console.log('Selected row text:', selectedText)
    expect(['1', '2']).toContain(selectedText)  // Could be 1 or 2 depending on timing

    // Wait more and verify playback continues
    await page.waitForTimeout(2000)

    const currentTime2 = await mediaElement.evaluate((el: HTMLMediaElement) => el.currentTime)
    const isPlaying2 = await mediaElement.evaluate((el: HTMLMediaElement) => !el.paused)

    console.log('After 3.5s: currentTime =', currentTime2, 'playing =', isPlaying2)
    expect(isPlaying2).toBe(true)
    expect(currentTime2).toBeGreaterThan(3.0)  // Should be well past 3 seconds

    // Verify auto-scroll updated to a later row
    selectedRow = page.locator('.ag-row-selected')
    selectedText = await selectedRow.locator('.ag-cell[col-id="text"]').textContent()
    console.log('Selected row after 3.5s:', selectedText)
    expect(['3', '4']).toContain(selectedText)

    // Pause playback (button text changes to pause icon when playing)
    const pauseButton = page.locator('button.control-btn', { hasText: '⏸️' })
    await pauseButton.click()
    await page.waitForTimeout(200)

    const isPaused = await mediaElement.evaluate((el: HTMLMediaElement) => el.paused)
    expect(isPaused).toBe(true)

    console.log('✅ Continuous playback works correctly!')
  })

  test('snippet playback should still stop at segment end', async ({ page }) => {
    await page.goto('/')

    // Load the test files
    const vttPath = path.join(process.cwd(), 'tests', 'fixtures', '100-cues.vtt')
    const audioPath = path.join(process.cwd(), 'tests', 'fixtures', '100s-silence.flac')

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles([vttPath, audioPath])
    await page.waitForTimeout(500)

    console.log('Files loaded')

    // Get the media element
    const mediaElement = page.locator('audio, video')

    // Click the play snippet button on row 10
    const row10 = page.locator('.ag-row').nth(10)
    const playSnippetButton = row10.locator('button[title="Play snippet"]')
    await playSnippetButton.click()

    console.log('Started snippet playback for row 10')

    // Wait for snippet to finish (1 second + buffer)
    await page.waitForTimeout(1200)

    // Verify playback stopped
    const isPaused = await mediaElement.evaluate((el: HTMLMediaElement) => el.paused)
    expect(isPaused).toBe(true)

    // Verify we're back at the start of the segment
    const currentTime = await mediaElement.evaluate((el: HTMLMediaElement) => el.currentTime)
    console.log('After snippet: currentTime =', currentTime, 'paused =', isPaused)
    expect(currentTime).toBeCloseTo(10.0, 1)  // Should be around 10 seconds

    console.log('✅ Snippet playback stops correctly!')
  })
})
