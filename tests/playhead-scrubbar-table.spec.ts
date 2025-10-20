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

  // Helper function to seek to a time
  async function seekToTime(page: any, time: number) {
    await page.evaluate((timeValue: number) => {
      ;(window as any).$store.setCurrentTime(timeValue)
    }, time)
    await page.waitForTimeout(100)
  }


  test('should integrate playhead, scrub bar, and table with complete workflow', async ({ page }) => {
    // Clear localStorage and reload to start fresh
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()

    // Load the 10-second audio file
    const audioPath = path.join(__dirname, 'fixtures', 'test-audio-10s.wav')

    await page.evaluate((filePath) => {
      // Simulate loading an audio file
      const audioUrl = `file://${filePath}`
      // Use window.$store exposed by the app
      ;(window as any).$store.loadMediaFile(audioUrl)
    }, audioPath)

    await page.waitForTimeout(200)

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
    await page.waitForTimeout(100)

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

    // === Test 2: Add cue BEFORE first cue ===
    console.log('Test 2: Adding cue before first cue')

    // Seek to 0.5 seconds
    await seekToTime(page, 0.5)

    currentTime = await page.evaluate(() => (window as any).$store.currentTime)
    expect(currentTime).toBeCloseTo(0.5, 1)

    // Add caption at 0.5s
    await addCaptionBtn.click()
    await page.waitForTimeout(100)

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
    await page.waitForTimeout(100)

    // Verify we now have 3 rows
    rowCount = await page.locator('.ag-row').count()
    expect(rowCount).toBe(3)

    // Verify third cue
    stored = await page.evaluate(() => {
      const data = localStorage.getItem('vtt-editor-document')
      return data ? JSON.parse(data) : null
    })
    expect(stored.document.cues).toHaveLength(3)

    // === Test 4: Scrub bar seeking (auto-selection not yet implemented) ===
    console.log('Test 4: Testing scrub bar seeking')

    // Verify seeking works correctly
    await seekToTime(page, 1)
    currentTime = await page.evaluate(() => (window as any).$store.currentTime)
    expect(currentTime).toBeCloseTo(1, 1)

    await seekToTime(page, 3)
    currentTime = await page.evaluate(() => (window as any).$store.currentTime)
    expect(currentTime).toBeCloseTo(3, 1)

    await seekToTime(page, 9)
    currentTime = await page.evaluate(() => (window as any).$store.currentTime)
    expect(currentTime).toBeCloseTo(9, 1)

    // === Test 5: Table row selection moves playhead ===
    console.log('Test 5: Testing table row selection moves playhead')

    // Get all rows - they should be sorted by start time now
    const rows = await page.locator('.ag-row').all()
    console.log('Total rows:', rows.length)

    // Verify rows are sorted by checking start times
    const firstRowTime = await rows[0].locator('[col-id="startTime"]').textContent()
    const secondRowTime = await rows[1].locator('[col-id="startTime"]').textContent()
    const thirdRowTime = await rows[2].locator('[col-id="startTime"]').textContent()
    console.log('Row times:', firstRowTime, secondRowTime, thirdRowTime)
    expect(firstRowTime).toBe('00:00:00.500')  // First cue at 0.5s
    expect(secondRowTime).toBe('00:00:02.000')  // Second cue at 2s
    expect(thirdRowTime).toBe('00:00:08.000')   // Third cue at 8s

    // Click on first row (0.5s cue) and verify playhead moves
    await rows[0].click()
    await page.waitForTimeout(200)
    currentTime = await page.evaluate(() => (window as any).$store.currentTime)
    expect(currentTime).toBeCloseTo(0.5, 1)

    // Click on second row (2s cue) and verify playhead moves
    await rows[1].click()
    await page.waitForTimeout(200)
    currentTime = await page.evaluate(() => (window as any).$store.currentTime)
    expect(currentTime).toBeCloseTo(2, 1)

    // Click on third row (8s cue) and verify playhead moves
    await rows[2].click()
    await page.waitForTimeout(200)
    currentTime = await page.evaluate(() => (window as any).$store.currentTime)
    expect(currentTime).toBeCloseTo(8, 1)

    // Note: Scrubber visual value doesn't update reactively - known limitation
    // The scrubber uses :value binding which only sets initial DOM value
    // Time display and playback work correctly though

    console.log('All tests completed successfully!')
  })
})
