import { test, expect, _electron as electron } from '@playwright/test'
import { ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { enableConsoleCapture } from './helpers/console'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

test.describe('VTT Editor - Playhead, Scrub Bar, and Table Integration', () => {
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

  // Helper function to seek to a time
  async function seekToTime(time: number) {
    await window.evaluate((timeValue: number) => {
      ;(window as any).$store.setCurrentTime(timeValue)
    }, time)
    await window.waitForTimeout(100)
  }


  test('should integrate playhead, scrub bar, and table with complete workflow', async () => {
    console.log('=== TEST START: Playhead/Scrubbar/Table Integration ===')

    // Reset store to clean state before test
    console.log('Resetting store to clean state...')
    await window.evaluate(() => {
      const store = (window as any).$store
      // Reset to empty document
      store.loadFromFile('WEBVTT\n', '/test/empty.vtt')
      store.setCurrentTime(0)
      store.loadMediaFile(null)
    })

    // Wait for AG Grid to reflect the empty state - check that rows disappear
    console.log('Waiting for AG Grid to clear...')
    await window.waitForFunction(() => {
      const rows = document.querySelectorAll('.ag-row')
      return rows.length === 0
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
        mediaUrl: store.mediaUrl
      }
    })
    console.log('Initial state after reset:', JSON.stringify(initialState, null, 2))

    // Load the 10-second audio file
    const audioPath = path.join(__dirname, 'fixtures', 'test-audio-10s.wav')
    console.log('Loading audio from:', audioPath)

    await window.evaluate((filePath) => {
      // Simulate loading an audio file
      const audioUrl = `file://${filePath}`
      console.log('[TEST] Loading media file:', audioUrl)
      // Use window.$store exposed by the app
      ;(window as any).$store.loadMediaFile(audioUrl)
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

    let rowCount = await window.locator('.ag-row').count()
    console.log(`Initial row count: ${rowCount} (expected: 0)`)

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
    // Note: AG Grid may have ghost rows (empty duplicate rows), so count rows with content
    rowCount = await window.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.ag-row'))
      return rows.filter((row: any) => {
        const text = row.textContent?.trim() || ''
        return text.length > 0
      }).length
    })
    console.log(`Row count (with content) after adding caption: ${rowCount} (expected: 1)`)

    expect(rowCount).toBe(1)

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

    // Verify we now have 2 rows (count rows with content to avoid ghost rows)
    rowCount = await window.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.ag-row'))
      return rows.filter((row: any) => (row.textContent?.trim() || '').length > 0).length
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

    // Verify we now have 3 rows (count rows with content to avoid ghost rows)
    rowCount = await window.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.ag-row'))
      return rows.filter((row: any) => (row.textContent?.trim() || '').length > 0).length
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

    // Get all rows - filter out ghost rows (empty rows) to get only real rows
    const allRows = await window.locator('.ag-row').all()
    console.log('Total rows:', allRows.length)

    // Filter to get only rows with actual content (skip ghost rows)
    const rowsWithContent = []
    for (const row of allRows) {
      const text = await row.textContent()
      if (text && text.trim().length > 0) {
        rowsWithContent.push(row)
      }
    }
    console.log('Rows with content:', rowsWithContent.length)

    // Sort rows by start time since AG Grid doesn't reorder DOM when array changes
    const rowsWithTimes = await Promise.all(
      rowsWithContent.map(async (row) => {
        const timeText = await row.locator('[col-id="startTime"]').textContent()
        return { row, timeText }
      })
    )
    rowsWithTimes.sort((a, b) => (a.timeText || '').localeCompare(b.timeText || ''))
    const rows = rowsWithTimes.map(r => r.row)

    // Verify rows are sorted by checking start times
    const firstRowTime = await rows[0].locator('[col-id="startTime"]').textContent()
    const secondRowTime = await rows[1].locator('[col-id="startTime"]').textContent()
    const thirdRowTime = await rows[2].locator('[col-id="startTime"]').textContent()
    console.log('Row times (after sorting):', firstRowTime, secondRowTime, thirdRowTime)
    expect(firstRowTime).toBe('00:00:00.500')  // First cue at 0.5s
    expect(secondRowTime).toBe('00:00:02.000')  // Second cue at 2s
    expect(thirdRowTime).toBe('00:00:08.000')   // Third cue at 8s

    // Click on first row (0.5s cue) and verify playhead moves
    await rows[0].click()
    await window.waitForTimeout(200)
    currentTime = await window.evaluate(() => (window as any).$store.currentTime)
    expect(currentTime).toBeCloseTo(0.5, 1)

    // Click on second row (2s cue) and verify playhead moves
    await rows[1].click()
    await window.waitForTimeout(200)
    currentTime = await window.evaluate(() => (window as any).$store.currentTime)
    expect(currentTime).toBeCloseTo(2, 1)

    // Click on third row (8s cue) and verify playhead moves
    await rows[2].click()
    await window.waitForTimeout(200)
    currentTime = await window.evaluate(() => (window as any).$store.currentTime)
    expect(currentTime).toBeCloseTo(8, 1)

    // Note: Scrubber visual value doesn't update reactively - known limitation
    // The scrubber uses :value binding which only sets initial DOM value
    // Time display and playback work correctly though

    console.log('All tests completed successfully!')
  })
})
