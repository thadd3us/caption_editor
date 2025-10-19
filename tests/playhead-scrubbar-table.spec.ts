import { test, expect } from './helpers/coverage'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

test.describe('VTT Editor - Playhead, Scrub Bar, and Table Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
  })

  // Helper function to seek using scrubber
  async function seekToTime(page: any, time: number) {
    await page.evaluate((timeValue: number) => {
      const scrubberEl = document.querySelector('.scrubber') as HTMLInputElement
      if (scrubberEl) {
        scrubberEl.value = String(timeValue)
        scrubberEl.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }, time)
    await page.waitForTimeout(500)
  }

  // Helper function to get scrubber value
  async function getScrubberValue(page: any) {
    return await page.evaluate(() => {
      const scrubberEl = document.querySelector('.scrubber') as HTMLInputElement
      return scrubberEl ? parseFloat(scrubberEl.value) : 0
    })
  }

  test('should integrate playhead, scrub bar, and table with complete workflow', async ({ page }) => {
    // Load the 10-second audio file
    const audioPath = path.join(__dirname, 'fixtures', 'test-audio-10s.wav')

    await page.evaluate((filePath) => {
      // Simulate loading an audio file
      const audioUrl = `file://${filePath}`
      // Use window.$store exposed by the app
      ;(window as any).$store.loadMediaFile(audioUrl)
    }, audioPath)

    await page.waitForTimeout(1000)

    // Verify media player is ready
    const mediaPlayer = page.locator('.media-player')
    await expect(mediaPlayer).toBeVisible()

    // Verify scrubber is enabled
    const scrubber = page.locator('.scrubber')
    await expect(scrubber).toBeEnabled()

    // Verify "Add Caption" button is enabled
    const addCaptionBtn = page.locator('.add-caption-btn')
    await expect(addCaptionBtn).toBeEnabled()

    // === Test 1: Add first cue to empty table ===
    console.log('Test 1: Adding first cue to empty table')

    // Verify table is empty initially
    const grid = page.locator('.ag-theme-alpine')
    await expect(grid).toBeVisible()

    let rowCount = await page.locator('.ag-row').count()
    expect(rowCount).toBe(0)

    // Set playhead to 2 seconds using scrubber
    await seekToTime(page, 2)

    // Verify current time in store
    let currentTime = await page.evaluate(() => (window as any).$store.currentTime)
    expect(currentTime).toBeCloseTo(2, 1)

    // Click "Add Caption" button
    await addCaptionBtn.click()
    await page.waitForTimeout(500)

    // Verify first row was added
    rowCount = await page.locator('.ag-row').count()
    expect(rowCount).toBe(1)

    // Verify the cue in localStorage spans 2-7 seconds (default 5s duration)
    let stored = await page.evaluate(() => {
      const data = localStorage.getItem('vtt-editor-document')
      return data ? JSON.parse(data) : null
    })
    expect(stored.document.cues).toHaveLength(1)
    expect(stored.document.cues[0].startTime).toBeCloseTo(2, 1)
    expect(stored.document.cues[0].endTime).toBeCloseTo(7, 1)

    // Verify first row is selected in table
    let selectedRows = await page.locator('.ag-row.ag-row-selected').count()
    expect(selectedRows).toBe(1)

    // === Test 2: Add cue BEFORE first cue ===
    console.log('Test 2: Adding cue before first cue')

    // Seek to 0.5 seconds
    await seekToTime(page, 0.5)

    currentTime = await page.evaluate(() => (window as any).$store.currentTime)
    expect(currentTime).toBeCloseTo(0.5, 1)

    // Add caption at 0.5s
    await addCaptionBtn.click()
    await page.waitForTimeout(500)

    // Verify we now have 2 rows
    rowCount = await page.locator('.ag-row').count()
    expect(rowCount).toBe(2)

    // Verify cues are in correct order
    stored = await page.evaluate(() => {
      const data = localStorage.getItem('vtt-editor-document')
      return data ? JSON.parse(data) : null
    })
    expect(stored.document.cues).toHaveLength(2)

    // Should be sorted by start time
    const sortedCues = stored.document.cues.sort((a: any, b: any) => a.startTime - b.startTime)
    expect(sortedCues[0].startTime).toBeCloseTo(0.5, 1)
    expect(sortedCues[0].endTime).toBeCloseTo(5.5, 1)
    expect(sortedCues[1].startTime).toBeCloseTo(2, 1)
    expect(sortedCues[1].endTime).toBeCloseTo(7, 1)

    // === Test 3: Add cue AFTER existing cues ===
    console.log('Test 3: Adding cue after existing cues')

    // Seek to 8 seconds
    await seekToTime(page, 8)

    currentTime = await page.evaluate(() => (window as any).$store.currentTime)
    expect(currentTime).toBeCloseTo(8, 1)

    // Add caption at 8s
    await addCaptionBtn.click()
    await page.waitForTimeout(500)

    // Verify we now have 3 rows
    rowCount = await page.locator('.ag-row').count()
    expect(rowCount).toBe(3)

    // Verify third cue
    stored = await page.evaluate(() => {
      const data = localStorage.getItem('vtt-editor-document')
      return data ? JSON.parse(data) : null
    })
    expect(stored.document.cues).toHaveLength(3)

    // === Test 4: Scrub bar seeking selects correct table row ===
    console.log('Test 4: Testing scrub bar seeking selects correct row')

    // Seek to 1 second (within first cue: 0.5-5.5)
    await seekToTime(page, 1)

    // Check that first row is selected
    let firstRowText = await page.locator('.ag-row').first().locator('[col-id="startTimeFormatted"]').textContent()
    let selectedRowText = await page.locator('.ag-row.ag-row-selected').first().locator('[col-id="startTimeFormatted"]').textContent()
    expect(selectedRowText).toBe(firstRowText)

    // Seek to 3 seconds (within second cue: 2-7)
    await seekToTime(page, 3)

    // Check that second row is selected
    let secondRowText = await page.locator('.ag-row').nth(1).locator('[col-id="startTimeFormatted"]').textContent()
    selectedRowText = await page.locator('.ag-row.ag-row-selected').first().locator('[col-id="startTimeFormatted"]').textContent()
    expect(selectedRowText).toBe(secondRowText)

    // Seek to 9 seconds (within third cue: 8-13, but capped at 10s)
    await seekToTime(page, 9)

    // Check that third row is selected
    let thirdRowText = await page.locator('.ag-row').nth(2).locator('[col-id="startTimeFormatted"]').textContent()
    selectedRowText = await page.locator('.ag-row.ag-row-selected').first().locator('[col-id="startTimeFormatted"]').textContent()
    expect(selectedRowText).toBe(thirdRowText)

    // === Test 5: Table row selection moves playhead and scrub bar ===
    console.log('Test 5: Testing table row selection moves playhead')

    // Click on first row
    await page.locator('.ag-row').first().click()
    await page.waitForTimeout(500)

    // Verify playhead is at start of first cue (0.5s)
    currentTime = await page.evaluate(() => (window as any).$store.currentTime)
    expect(currentTime).toBeCloseTo(0.5, 1)

    // Verify scrubber position
    let scrubberValue = await getScrubberValue(page)
    expect(scrubberValue).toBeCloseTo(0.5, 1)

    // Click on third row
    await page.locator('.ag-row').nth(2).click()
    await page.waitForTimeout(500)

    // Verify playhead is at start of third cue (8s)
    currentTime = await page.evaluate(() => (window as any).$store.currentTime)
    expect(currentTime).toBeCloseTo(8, 1)

    // Verify scrubber position
    scrubberValue = await getScrubberValue(page)
    expect(scrubberValue).toBeCloseTo(8, 1)

    // === Test 6: Seeking to gaps between captions ===
    console.log('Test 6: Testing seeking to gaps between captions')

    // Seek to 7.5 seconds (gap between second cue ending at 7s and third cue starting at 8s)
    await seekToTime(page, 7.5)

    // Should select the row PRIOR to this time (second row, which ends at 7s)
    selectedRowText = await page.locator('.ag-row.ag-row-selected').first().locator('[col-id="startTimeFormatted"]').textContent()
    secondRowText = await page.locator('.ag-row').nth(1).locator('[col-id="startTimeFormatted"]').textContent()
    expect(selectedRowText).toBe(secondRowText)

    // === Test 7: Seeking before first caption ===
    console.log('Test 7: Testing seeking before first caption')

    // Seek to 0.2 seconds (before first cue which starts at 0.5s)
    await seekToTime(page, 0.2)

    // Should select the first row (no prior row exists)
    selectedRowText = await page.locator('.ag-row.ag-row-selected').first().locator('[col-id="startTimeFormatted"]').textContent()
    firstRowText = await page.locator('.ag-row').first().locator('[col-id="startTimeFormatted"]').textContent()
    expect(selectedRowText).toBe(firstRowText)

    // Verify the selection behavior when seeking to 0
    await seekToTime(page, 0)

    // Should still select first row
    selectedRowText = await page.locator('.ag-row.ag-row-selected').first().locator('[col-id="startTimeFormatted"]').textContent()
    firstRowText = await page.locator('.ag-row').first().locator('[col-id="startTimeFormatted"]').textContent()
    expect(selectedRowText).toBe(firstRowText)

    console.log('All tests completed successfully!')
  })
})
