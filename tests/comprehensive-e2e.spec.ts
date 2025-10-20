import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

test.describe('VTT Editor - Comprehensive E2E Test', () => {
  // Helper to seek to a specific time
  async function seekToTime(page: any, time: number) {
    await page.evaluate((timeValue: number) => {
      ;(window as any).$store.setCurrentTime(timeValue)
    }, time)
    await page.waitForTimeout(100)
  }

  // Helper to get exported VTT
  async function getExportedVTT(page: any): Promise<string> {
    return await page.evaluate(() => {
      return (window as any).$store.exportToString()
    })
  }

  test('should complete full workflow with VTT validation', async ({ page }) => {
    test.setTimeout(15000) // This test has many steps

    // === Setup: Load empty app with 10-second audio ===
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()

    const audioPath = path.join(__dirname, 'fixtures', 'test-audio-10s.wav')
    await page.evaluate((filePath) => {
      const audioUrl = `file://${filePath}`
      ;(window as any).$store.loadMediaFile(audioUrl)
    }, audioPath)

    await page.waitForTimeout(200)

    // === Step 1: Check initial empty VTT export ===
    console.log('Step 1: Verify empty VTT export')
    let exportedVTT = await getExportedVTT(page)
    const expectedEmptyVTT = 'WEBVTT'
    expect(exportedVTT.trim()).toBe(expectedEmptyVTT)

    // === Step 2: Seek to 2 seconds and add first cue ===
    console.log('Step 2: Add cue at 2 seconds')
    await seekToTime(page, 2)

    const addCaptionBtn = page.locator('button:has-text("Add Caption")')
    await addCaptionBtn.click()
    await page.waitForTimeout(100)

    // Edit the text to "test at 2 seconds"
    const firstCell = page.locator('.ag-row').first().locator('[col-id="text"]')
    await firstCell.dblclick()
    await page.keyboard.press('Control+A')
    await page.keyboard.type('test at 2 seconds')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(100)

    // === Step 3: Verify table has one row with correct times ===
    console.log('Step 3: Verify table with one row')
    const rowCount = await page.locator('.ag-row').count()
    expect(rowCount).toBe(1)

    const startTime = await page.locator('.ag-row').first().locator('[col-id="startTime"]').textContent()
    const endTime = await page.locator('.ag-row').first().locator('[col-id="endTime"]').textContent()
    expect(startTime).toBe('00:00:02.000')
    expect(endTime).toBe('00:00:07.000')

    // === Step 4: Check exported VTT after first cue ===
    console.log('Step 4: Check VTT export after first cue')
    exportedVTT = await getExportedVTT(page)

    // Get the actual cue ID from the page
    const firstCueId = await page.evaluate(() => {
      const store = (window as any).$store
      return store.document.cues[0].id
    })

    const expectedAfterFirstCue = `WEBVTT

${firstCueId}
00:00:02.000 --> 00:00:07.000
test at 2 seconds`
    expect(exportedVTT.trim()).toBe(expectedAfterFirstCue.trim())

    // === Step 5: Seek to 1 second and add second cue ===
    console.log('Step 5: Add cue at 1 second')
    await seekToTime(page, 1)
    await addCaptionBtn.click()
    await page.waitForTimeout(100)

    // Edit the text to "Test at 1 second."
    const rows = await page.locator('.ag-row').all()
    const secondCueCell = rows[0].locator('[col-id="text"]')
    await secondCueCell.dblclick()
    await page.keyboard.press('Control+A')
    await page.keyboard.type('Test at 1 second.')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(100)

    // === Step 6: Verify table has two rows in correct order ===
    console.log('Step 6: Verify table with two rows')
    const newRowCount = await page.locator('.ag-row').count()
    expect(newRowCount).toBe(2)

    const allRows = await page.locator('.ag-row').all()
    const firstRowStart = await allRows[0].locator('[col-id="startTime"]').textContent()
    const secondRowStart = await allRows[1].locator('[col-id="startTime"]').textContent()
    expect(firstRowStart).toBe('00:00:01.000')
    expect(secondRowStart).toBe('00:00:02.000')

    // === Step 7: Edit end time of first row to 2 seconds ===
    console.log('Step 7: Edit end time of first row')
    const firstRowEndCell = allRows[0].locator('[col-id="endTime"]')
    await firstRowEndCell.dblclick()
    await page.keyboard.press('Control+A')
    await page.keyboard.type('00:00:02.000')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(100)

    // === Step 8: Set rating of first row to 3 stars ===
    console.log('Step 8: Set rating to 3 stars')
    const firstRowRating = allRows[0].locator('.star-rating')
    const thirdStar = firstRowRating.locator('.star[data-star-index="3"]')
    await thirdStar.click()
    await page.waitForTimeout(100)

    // === Step 9: Check exported VTT with rating ===
    console.log('Step 9: Check VTT export with rating')
    exportedVTT = await getExportedVTT(page)

    // Get the actual cue IDs from the page
    const cueIds = await page.evaluate(() => {
      const store = (window as any).$store
      return store.document.cues.map((c: any) => c.id)
    })

    const expectedWithRating = `WEBVTT

NOTE {\"id\":\"${cueIds[0]}\",\"rating\":3}

${cueIds[0]}
00:00:01.000 --> 00:00:02.000
Test at 1 second.

${cueIds[1]}
00:00:02.000 --> 00:00:07.000
test at 2 seconds`
    expect(exportedVTT.trim()).toBe(expectedWithRating.trim())

    // === Step 10: Seek to 9 seconds and add third cue ===
    console.log('Step 10: Add cue at 9 seconds')
    await seekToTime(page, 9)
    await addCaptionBtn.click()
    await page.waitForTimeout(100)

    // Edit the text to "test at 9 seconds"
    const thirdRows = await page.locator('.ag-row').all()
    const thirdCueCell = thirdRows[2].locator('[col-id="text"]')
    await thirdCueCell.dblclick()
    await page.keyboard.press('Control+A')
    await page.keyboard.type('test at 9 seconds')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(100)

    // === Step 11: Verify table has three rows in correct order with rating ===
    console.log('Step 11: Verify table with three rows')
    const thirdRowCount = await page.locator('.ag-row').count()
    expect(thirdRowCount).toBe(3)

    const threeRows = await page.locator('.ag-row').all()
    const row1Start = await threeRows[0].locator('[col-id="startTime"]').textContent()
    const row2Start = await threeRows[1].locator('[col-id="startTime"]').textContent()
    const row3Start = await threeRows[2].locator('[col-id="startTime"]').textContent()
    expect(row1Start).toBe('00:00:01.000')
    expect(row2Start).toBe('00:00:02.000')
    expect(row3Start).toBe('00:00:09.000')

    // Verify first row still has rating of 3
    const row1Rating = await threeRows[0].locator('.star-rating').getAttribute('data-rating')
    expect(row1Rating).toBe('3')

    // === Step 12: Check exported VTT with three cues ===
    console.log('Step 12: Check VTT export with three cues')
    exportedVTT = await getExportedVTT(page)

    const allCueIds = await page.evaluate(() => {
      const store = (window as any).$store
      return store.document.cues.map((c: any) => c.id)
    })

    const expectedThreeCues = `WEBVTT

NOTE {\"id\":\"${allCueIds[0]}\",\"rating\":3}

${allCueIds[0]}
00:00:01.000 --> 00:00:02.000
Test at 1 second.

${allCueIds[1]}
00:00:02.000 --> 00:00:07.000
test at 2 seconds

${allCueIds[2]}
00:00:09.000 --> 00:00:14.000
test at 9 seconds`
    expect(exportedVTT.trim()).toBe(expectedThreeCues.trim())

    // === Step 13: Test Jump to Row at 1.5 seconds ===
    console.log('Step 13: Jump to row at 1.5 seconds')
    await seekToTime(page, 1.5)
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const jumpBtn = buttons.find(btn => btn.textContent?.includes('Jump to Row'))
      if (jumpBtn) jumpBtn.click()
    })
    await page.waitForTimeout(200)

    // Verify first row is selected
    const selectedRows1 = await page.locator('.ag-row.ag-row-selected').count()
    expect(selectedRows1).toBe(1)
    const selectedRowStart1 = await page.locator('.ag-row.ag-row-selected').first().locator('[col-id="startTime"]').textContent()
    expect(selectedRowStart1).toBe('00:00:01.000')

    // === Step 14: Test Jump to Row at 5 seconds ===
    console.log('Step 14: Jump to row at 5 seconds')
    await seekToTime(page, 5)
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const jumpBtn = buttons.find(btn => btn.textContent?.includes('Jump to Row'))
      if (jumpBtn) jumpBtn.click()
    })
    await page.waitForTimeout(200)

    // Verify second row is selected
    const selectedRows2 = await page.locator('.ag-row.ag-row-selected').count()
    expect(selectedRows2).toBe(1)
    const selectedRowStart2 = await page.locator('.ag-row.ag-row-selected').first().locator('[col-id="startTime"]').textContent()
    expect(selectedRowStart2).toBe('00:00:02.000')

    // === Step 15: Test Jump to Row at 8.5 seconds ===
    console.log('Step 15: Jump to row at 8.5 seconds')
    await seekToTime(page, 8.5)
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const jumpBtn = buttons.find(btn => btn.textContent?.includes('Jump to Row'))
      if (jumpBtn) jumpBtn.click()
    })
    await page.waitForTimeout(200)

    // Verify still second row is selected (8.5 is before third cue at 9s)
    const selectedRows3 = await page.locator('.ag-row.ag-row-selected').count()
    expect(selectedRows3).toBe(1)
    const selectedRowStart3 = await page.locator('.ag-row.ag-row-selected').first().locator('[col-id="startTime"]').textContent()
    expect(selectedRowStart3).toBe('00:00:02.000')

    // === Step 16: Click first row to jump to its time ===
    console.log('Step 16: Click first row to jump to time')
    const finalRows = await page.locator('.ag-row').all()
    await finalRows[0].click()
    await page.waitForTimeout(200)

    // Verify playhead is at 1 second (start of first row)
    const currentTime = await page.evaluate(() => (window as any).$store.currentTime)
    expect(currentTime).toBeCloseTo(1, 1)

    // === Step 17: Edit text in first row ===
    console.log('Step 17: Edit text in first row')
    const firstRowTextCell = finalRows[0].locator('[col-id="text"]')
    await firstRowTextCell.dblclick()
    await page.keyboard.press('Control+A')
    await page.keyboard.type('Edited first row text')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(100)

    // === Step 18: Change rating in third row to 5 stars ===
    console.log('Step 18: Set third row rating to 5 stars')
    const thirdRowRating = finalRows[2].locator('.star-rating')
    const fifthStar = thirdRowRating.locator('.star[data-star-index="5"]')
    await fifthStar.click()
    await page.waitForTimeout(100)

    // === Step 19: Verify table contents ===
    console.log('Step 19: Verify final table contents')
    const finalAllRows = await page.locator('.ag-row').all()

    const row1Text = await finalAllRows[0].locator('[col-id="text"]').textContent()
    const row1RatingFinal = await finalAllRows[0].locator('.star-rating').getAttribute('data-rating')
    expect(row1Text).toBe('Edited first row text')
    expect(row1RatingFinal).toBe('3')

    const row3RatingFinal = await finalAllRows[2].locator('.star-rating').getAttribute('data-rating')
    expect(row3RatingFinal).toBe('5')

    // === Step 20: Check final exported VTT ===
    console.log('Step 20: Check final VTT export')
    exportedVTT = await getExportedVTT(page)

    const finalCueIds = await page.evaluate(() => {
      const store = (window as any).$store
      return store.document.cues.map((c: any) => c.id)
    })

    const expectedFinal = `WEBVTT

NOTE {\"id\":\"${finalCueIds[0]}\",\"rating\":3}

${finalCueIds[0]}
00:00:01.000 --> 00:00:02.000
Edited first row text

${finalCueIds[1]}
00:00:02.000 --> 00:00:07.000
test at 2 seconds

NOTE {\"id\":\"${finalCueIds[2]}\",\"rating\":5}

${finalCueIds[2]}
00:00:09.000 --> 00:00:14.000
test at 9 seconds`
    expect(exportedVTT.trim()).toBe(expectedFinal.trim())

    // === Step 21: Reload and verify persistence ===
    console.log('Step 21: Reload and verify persistence')
    await page.reload()
    await page.waitForTimeout(300)

    // Check that exported VTT is still the same
    const exportedAfterReload = await getExportedVTT(page)
    expect(exportedAfterReload.trim()).toBe(expectedFinal.trim())

    console.log('✅ All comprehensive E2E test steps passed!')
  })
})
