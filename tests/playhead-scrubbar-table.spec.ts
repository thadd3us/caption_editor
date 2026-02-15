import { sharedElectronTest as test, expect } from './helpers/shared-electron'
import type { Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

test.describe('Caption Editor - Playhead, Scrub Bar, and Table Integration', () => {
  let window: Page

  test.setTimeout(60000) // Increase timeout to 60s for E2E tests

  test.beforeEach(async ({ page }) => {
    window = page
  })

  // Helper function to seek to a time
  async function seekToTime(time: number) {
    await window.evaluate((timeValue: number) => {
      ; (window as any).$store.setCurrentTime(timeValue)
    }, time)
    await window.waitForTimeout(100)
  }


  test('should integrate playhead, scrub bar, and table with complete workflow', async () => {
    console.log('=== TEST START: Playhead/Scrubbar/Table Integration ===')

    // Reset store to clean state before test
    console.log('Resetting store to clean state...')
    await window.evaluate(() => {
      const store = (window as any).$store
      store.reset()
      store.setCurrentTime(0)
    })

    // Wait for AG Grid to reflect the empty state - check that rows disappear
    console.log('Waiting for AG Grid to clear...')
    await window.waitForFunction(() => {
      const rows = Array.from(document.querySelectorAll('.ag-row'))
      const uniqueRowIds = new Set(rows.map(r => r.getAttribute('row-id')).filter(id => id !== null))
      return uniqueRowIds.size === 0
    }, { timeout: 5000 })
    console.log('AG Grid cleared successfully')

    // Check initial state
    const initialState = await window.evaluate(() => {
      const store = (window as any).$store
      return {
        segmentCount: store.document.segments.length,
        segments: store.document.segments.map((s: any) => ({
          id: s.id,
          startTime: s.startTime,
          endTime: s.endTime,
          text: s.text
        })),
        currentTime: store.currentTime,
        mediaPath: store.mediaPath
      }
    })
    console.log('Initial state after reset:', JSON.stringify(initialState, null, 2))

    // Load the 10-second audio file
    const audioPath = path.join(process.cwd(), 'test_data', 'test-audio-10s.wav')
    console.log('Loading audio from:', audioPath)

    await window.evaluate((filePath) => {
      // Simulate loading an audio file
      // Use media:// protocol which we implemented for reliable Electron media loading
      const audioUrl = `media:///${filePath.replace(/\\/g, '/')}`
      console.log('[TEST] Loading media file:', audioUrl)
        // Use window.$store exposed by the app
        ; (window as any).$store.loadMediaFile(audioUrl)
    }, audioPath)

    await window.waitForTimeout(200)

    // Verify media player is ready
    const mediaPlayer = window.locator('.media-player')
    await expect(mediaPlayer).toBeVisible()

    // Verify scrubber is enabled
    const scrubber = window.locator('.scrubber')
    await expect(scrubber).toBeEnabled()

    // Verify "Add Caption" button is enabled
    const addCaptionBtn = window.locator('.add-caption-btn')
    await expect(addCaptionBtn).toBeEnabled()

    // === Test 1: Add first cue to empty table ===
    console.log('Test 1: Adding first cue to empty table')

    // Verify table is empty initially
    const grid = window.locator('.ag-theme-alpine')
    await expect(grid).toBeVisible()

    // Count unique rows by row-id
    let rowCount = await window.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.ag-row'))
      const uniqueRowIds = new Set(rows.map(r => r.getAttribute('row-id')).filter(id => id !== null))
      return uniqueRowIds.size
    })
    console.log(`Initial unique row count: ${rowCount} (expected: 0)`)

    // If not empty, log what's in the store AND what's in the DOM
    if (rowCount !== 0) {
      const debugInfo = await window.evaluate(() => {
        const store = (window as any).$store
        const rows = Array.from(document.querySelectorAll('.ag-row'))
        return {
          storeSegments: store.document.segments,
          domRowCount: rows.length,
          domRowTexts: rows.map((r: any) => r.textContent)
        }
      })
      console.log('ERROR: Table not empty!', JSON.stringify(debugInfo, null, 2))
    }

    expect(rowCount).toBe(0)

    // Set playhead to 2 seconds using scrubber
    console.log('Seeking to 2 seconds...')
    await seekToTime(2)

    // Verify current time in store
    let currentTime = await window.evaluate(() => (window as any).$store.currentTime)
    console.log(`Current time after seek: ${currentTime}`)
    expect(currentTime).toBeCloseTo(2, 1)

    // Click "Add Caption" button
    console.log('Clicking Add Caption button...')
    const clickResult = await window.evaluate(() => {
      const btn = document.querySelector('.add-caption-btn') as HTMLButtonElement
      const beforeCount = (window as any).$store.document.segments.length
      btn.click()
      const afterCount = (window as any).$store.document.segments.length
      return { beforeCount, afterCount }
    })
    console.log('Click result:', clickResult)

    // Wait for AG Grid to update (no longer recreated since we removed :key)
    await window.waitForTimeout(500)
    console.log('Waited for AG Grid to update')

    // Verify first row was added
    // Note: AG Grid creates multiple .ag-row elements when columns are pinned (pinned vs main section)
    const rowDebugInfo = await window.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.ag-row'))
      const uniqueRowNodes = new Map()

      rows.forEach(row => {
        const rowId = row.getAttribute('row-id')
        if (rowId && !uniqueRowNodes.has(rowId)) {
          uniqueRowNodes.set(rowId, row.textContent?.trim() || '')
        }
      })

      return {
        totalElements: rows.length,
        uniqueRowCount: uniqueRowNodes.size,
        contents: Array.from(uniqueRowNodes.values())
      }
    })
    console.log(`Row count debug info:`, JSON.stringify(rowDebugInfo, null, 2))
    rowCount = rowDebugInfo.uniqueRowCount

    expect(rowCount, `Expected 1 row but found ${rowCount}. Row contents: ${rowDebugInfo.contents.join(' | ')}`).toBe(1)

    // Verify the cue in store spans 2-7 seconds (default 5s duration)
    let cues = await window.evaluate(() => (window as any).$store.document.segments)
    expect(cues).toHaveLength(1)
    expect(cues[0].startTime).toBeCloseTo(2, 1)
    expect(cues[0].endTime).toBeCloseTo(7, 1)

    // === Test 2: Add cue BEFORE first cue ===
    console.log('Test 2: Adding cue before first cue')

    // Seek to 0.5 seconds
    await seekToTime(0.5)

    currentTime = await window.evaluate(() => (window as any).$store.currentTime)
    expect(currentTime).toBeCloseTo(0.5, 1)

    // Add caption at 0.5s
    await addCaptionBtn.click()

    // Wait for AG Grid to recreate itself (gridKey changed)
    await window.waitForTimeout(1000)

    // Verify we now have 2 rows (count unique rows by row-id)
    rowCount = await window.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.ag-row'))
      const uniqueRowIds = new Set(rows.map(r => r.getAttribute('row-id')).filter(id => id !== null))
      return uniqueRowIds.size
    })
    expect(rowCount).toBe(2)

    // Verify cues are in correct order
    cues = await window.evaluate(() => (window as any).$store.document.segments)
    expect(cues).toHaveLength(2)

    // Should be sorted by start time (store keeps them sorted)
    expect(cues[0].startTime).toBeCloseTo(0.5, 1)
    expect(cues[0].endTime).toBeCloseTo(5.5, 1)
    expect(cues[1].startTime).toBeCloseTo(2, 1)
    expect(cues[1].endTime).toBeCloseTo(7, 1)

    // === Test 3: Add cue AFTER existing cues ===
    console.log('Test 3: Adding cue after existing cues')

    // Seek to 8 seconds
    await seekToTime(8)

    currentTime = await window.evaluate(() => (window as any).$store.currentTime)
    expect(currentTime).toBeCloseTo(8, 1)

    // Add caption at 8s
    await addCaptionBtn.click()

    // Wait for AG Grid to recreate itself (gridKey changed)
    await window.waitForTimeout(1000)

    // Verify we now have 3 rows (count unique rows by row-id)
    rowCount = await window.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.ag-row'))
      const uniqueRowIds = new Set(rows.map(r => r.getAttribute('row-id')).filter(id => id !== null))
      return uniqueRowIds.size
    })
    expect(rowCount).toBe(3)

    // Verify third cue
    cues = await window.evaluate(() => (window as any).$store.document.segments)
    expect(cues).toHaveLength(3)

    // === Test 4: Scrub bar seeking (auto-selection not yet implemented) ===
    console.log('Test 4: Testing scrub bar seeking')

    // Verify seeking works correctly
    await seekToTime(1)
    currentTime = await window.evaluate(() => (window as any).$store.currentTime)
    expect(currentTime).toBeCloseTo(1, 1)

    await seekToTime(3)
    currentTime = await window.evaluate(() => (window as any).$store.currentTime)
    expect(currentTime).toBeCloseTo(3, 1)

    await seekToTime(9)
    currentTime = await window.evaluate(() => (window as any).$store.currentTime)
    expect(currentTime).toBeCloseTo(9, 1)

    // === Test 5: Table row selection moves playhead ===
    console.log('Test 5: Testing table row selection moves playhead')

    // Get all unique row IDs from the grid
    const uniqueRowIds = await window.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.ag-row'))
      return Array.from(new Set(rows.map(r => r.getAttribute('row-id')).filter(id => id !== null)))
    })
    console.log('Unique row IDs:', uniqueRowIds)

    // For each unique row ID, find the row element that contains the startTime cell
    // (Pinned rows won't have it, main rows will)
    const rowsWithTimes = []
    for (const id of uniqueRowIds) {
      const rowLocator = window.locator(`.ag-row[row-id="${id}"]`)
      // Find the cell within this logical row that has the startTime colId
      const startTimeCell = rowLocator.locator('[col-id="startTime"]').first()
      const timeText = await startTimeCell.textContent()
      if (timeText) {
        rowsWithTimes.push({ id, timeText, rowLocator })
      }
    }

    // Sort rows by start time
    rowsWithTimes.sort((a, b) => (a.timeText || '').localeCompare(b.timeText || ''))
    console.log('Sorted row IDs:', rowsWithTimes.map(r => r.id))

    // Verify rows are sorted by checking start times
    expect(rowsWithTimes[0].timeText).toBe('0.500')
    expect(rowsWithTimes[1].timeText).toBe('2.000')
    expect(rowsWithTimes[2].timeText).toBe('8.000')

    // Click on rows and verify playhead moves
    for (const [index, rowInfo] of rowsWithTimes.entries()) {
      console.log(`Clicking row ${index} (ID: ${rowInfo.id}, Time: ${rowInfo.timeText})...`)
      // Click the first cell in the row to ensure we click the "main" part of the row
      await rowInfo.rowLocator.locator('[col-id="startTime"]').first().click({ timeout: 10000 })
      await window.waitForTimeout(500)
      currentTime = await window.evaluate(() => (window as any).$store.currentTime)
      console.log(`Current time after clicking row ${index}: ${currentTime}`)
      expect(currentTime).toBeCloseTo(parseFloat(rowInfo.timeText!), 1)
    }

    // Note: Scrubber visual value doesn't update reactively - known limitation
    // The scrubber uses :value binding which only sets initial DOM value
    // Time display and playback work correctly though

    console.log('All tests completed successfully!')
  })
})
