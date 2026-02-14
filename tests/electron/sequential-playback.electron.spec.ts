import { sharedElectronTest as test, expect } from '../helpers/shared-electron'
import { ElectronApplication, Page } from '@playwright/test'
import * as path from 'path'
import { getProjectRoot } from '../helpers/project-root'

test.describe('Sequential Playback', () => {
  // Using shared Electron instance - no beforeEach/afterEach needed

  // Helper to load VTT file via IPC
  async function loadVTTFile(electronApp: ElectronApplication, page: Page, filePath: string) {
    await electronApp.evaluate(async ({ webContents }, path) => {
      const windows = webContents.getAllWebContents()
      if (windows.length > 0) {
        windows[0].send('open-file', path)
      }
    }, filePath)

    // Wait for file to load
    await page.waitForFunction(
      () => {
        const store = (window as any).$store
        return store && store.document && store.document.segments && store.document.segments.length > 0
      },
      { timeout: 5000 }
    )
  }

  // Helper to load media file
  async function loadMediaFile(page: Page, filePath: string) {
    await page.evaluate((path) => {
      const store = (window as any).$store
      if (store && store.loadMediaFile) {
        store.loadMediaFile(path, path)
      }
    }, filePath)
    await page.waitForFunction(
      (p) => {
        const store = (window as any).$store
        return store && store.mediaPath === p
      },
      filePath,
      { timeout: 2000 }
    )
  }

  test('should show sequential play button in table header', async ({ electronApp, page }) => {
    // Load a VTT file with multiple segments
    const vttPath = path.join(getProjectRoot(), 'test_data', 'with-media-reference.vtt')
    await loadVTTFile(electronApp, page, vttPath)

    // Sequential play button should be visible
    const sequentialBtn = page.locator('button.sequential-play-btn')
    await expect(sequentialBtn).toBeVisible()
  })

  test('should start sequential playback from top when no row selected', async ({ electronApp, page }) => {
    console.log('[Test] Loading VTT file...')
    const vttPath = path.join(getProjectRoot(), 'test_data', 'with-media-reference.vtt')
    await loadVTTFile(electronApp, page, vttPath)

    console.log('[Test] Loading media file...')
    const audioPath = path.join(getProjectRoot(), 'test_data', 'OSR_us_000_0010_8k.wav')
    await loadMediaFile(page, audioPath)

    console.log('[Test] Clicking Play Segments button...')
    const sequentialBtn = page.locator('button.sequential-play-btn')
    await sequentialBtn.click()

    console.log('[Test] Verifying button changed to Pause icon...')
    await expect(sequentialBtn).toHaveText(/⏸/)

    console.log('[Test] Checking playback state...')
    const state = await page.evaluate(() => {
      const store = (window as any).__vttStore
      return {
        playbackMode: store.playbackMode,
        isPlaying: store.isPlaying,
        selectedCueId: store.selectedCueId,
        currentTime: store.currentTime
      }
    })
    console.log('[Test] Playback state:', JSON.stringify(state, null, 2))

    // First row should be selected (set by startPlaylistPlayback)
    console.log('[Test] Waiting for row selection...')
    await page.waitForTimeout(200)
    const selectedRows = await page.locator('.ag-row.ag-row-selected').count()
    console.log('[Test] Selected rows count:', selectedRows)

    if (selectedRows === 0) {
      // Debug: log all rows
      const rowCount = await page.locator('.ag-row').count()
      console.log('[Test] Total rows:', rowCount)
    }

    expect(selectedRows).toBeGreaterThan(0)
  })

  test('should start sequential playback from selected row', async ({ electronApp, page }) => {
    test.setTimeout(15000) // Need extra time for AG Grid rendering

    // Load a VTT file
    const vttPath = path.join(getProjectRoot(), 'test_data', 'with-media-reference.vtt')
    await loadVTTFile(electronApp, page, vttPath)

    // Load media file
    const audioPath = path.join(getProjectRoot(), 'test_data', 'OSR_us_000_0010_8k.wav')
    await loadMediaFile(page, audioPath)

    // Wait for grid to be ready and have at least 3 rows
    await page.waitForFunction(() => {
      const api = (window as any).__agGridApi
      if (!api) return false
      let count = 0
      api.forEachNode(() => count++)
      return count >= 3
    }, { timeout: 5000 })

    // Wait a bit for AG Grid to fully render cells
    await page.waitForTimeout(200)

    // Click the third row (index 2) and get its text via evaluate
    // Filter out AG Grid ghost rows (known issue - see CLAUDE.md)
    const result = await page.evaluate(() => {
      const allRows = Array.from(document.querySelectorAll('.ag-row'))

      // Filter out ghost rows - rows that have no text content in their cells
      const realRows = allRows.filter((row: any) => {
        const textCell = row.querySelector('[col-id="text"]')
        return textCell && textCell.textContent?.trim().length > 0
      })

      console.log(`[Test Debug] Found ${allRows.length} total rows, ${realRows.length} real rows`)

      if (realRows.length < 3) {
        return { success: false, error: `Only ${realRows.length} real rows found (${allRows.length} total)`, text: null }
      }

      const thirdRow = realRows[2] as HTMLElement
      thirdRow.click()

      const textCell = thirdRow.querySelector('[col-id="text"]')
      const text = textCell?.textContent?.trim() || null

      if (!text) {
        return { success: false, error: 'Text cell is empty', text: null }
      }

      return { success: true, error: null, text }
    })

    if (!result.success) {
      throw new Error(`Could not get text from third row: ${result.error}`)
    }

    const thirdRowText = result.text

    await page.waitForTimeout(50)

    // Click sequential play button
    const sequentialBtn = page.locator('button.sequential-play-btn')
    await sequentialBtn.click()

    await page.waitForTimeout(100)

    // Third row should still be selected (started from there)
    const selectedRowText = await page.locator('.ag-row-selected [col-id="text"]').first().textContent()
    expect(selectedRowText).toBe(thirdRowText)
  })

  test('should stop sequential playback when pause button clicked', async ({ electronApp, page }) => {
    // Load files
    const vttPath = path.join(getProjectRoot(), 'test_data', 'with-media-reference.vtt')
    await loadVTTFile(electronApp, page, vttPath)

    const audioPath = path.join(getProjectRoot(), 'test_data', 'OSR_us_000_0010_8k.wav')
    await loadMediaFile(page, audioPath)

    // Start sequential playback
    const playBtn = page.locator('button.sequential-play-btn')
    await playBtn.click()

    // Button should change to pause icon
    await expect(playBtn).toHaveText(/⏸/)

    // Click pause
    await playBtn.click()

    // Button should change back to play
    await expect(playBtn).toHaveText(/▶️/)
  })

  test('should play segments in table order respecting sort', async ({ electronApp, page }) => {
    // Load files
    const vttPath = path.join(getProjectRoot(), 'test_data', 'with-media-reference.vtt')
    await loadVTTFile(electronApp, page, vttPath)

    const audioPath = path.join(getProjectRoot(), 'test_data', 'OSR_us_000_0010_8k.wav')
    await loadMediaFile(page, audioPath)

    // Get the grid API and capture initial order
    const initialOrder = await page.evaluate(() => {
      const api = (window as any).__agGridApi
      const segmentIds: string[] = []
      api.forEachNodeAfterFilterAndSort((node: any) => {
        if (node.data) {
          segmentIds.push(node.data.id)
        }
      })
      return segmentIds
    })

    // Start sequential playback
    await page.locator('button.sequential-play-btn').click()

    await page.waitForTimeout(100)

    // Check that the playlist matches the initial order
    const playlistOrder = await page.evaluate(() => {
      const store = (window as any).__vttStore
      return store.playlist
    })

    expect(playlistOrder).toEqual(initialOrder)
  })

  // Note: Advancement logic is tested in unit tests (vttStore.sequential.test.ts)
  // This E2E test was removed because it tested store logic rather than E2E behavior

  test('should preserve playlist order even if table is resorted', async ({ electronApp, page }) => {
    // Load files
    const vttPath = path.join(getProjectRoot(), 'test_data', 'with-media-reference.vtt')
    await loadVTTFile(electronApp, page, vttPath)

    const audioPath = path.join(getProjectRoot(), 'test_data', 'OSR_us_000_0010_8k.wav')
    await loadMediaFile(page, audioPath)

    // Start sequential playback
    await page.locator('button.sequential-play-btn').click()

    await page.waitForTimeout(50)

    // Get the playlist before sorting
    const playlistBefore = await page.evaluate(() => {
      const store = (window as any).__vttStore
      return [...store.playlist]
    })

    // Sort the table by text column (click header)
    await page.locator('.ag-header-cell:has-text("Caption")').click()

    await page.waitForTimeout(100)

    // Get the playlist after sorting
    const playlistAfter = await page.evaluate(() => {
      const store = (window as any).__vttStore
      return store.playlist
    })

    // Playlist should be unchanged
    expect(playlistAfter).toEqual(playlistBefore)
  })

  test('should disable sequential button when no media loaded', async ({ electronApp, page }) => {
    // Load only VTT file without media reference
    const vttPath = path.join(getProjectRoot(), 'test_data', 'no-media-reference.vtt')
    await loadVTTFile(electronApp, page, vttPath)

    // Sequential play button should be disabled (no media path)
    const sequentialBtn = page.locator('button.sequential-play-btn')
    await expect(sequentialBtn).toBeDisabled()
  })

  test('should work with single segment playback', async ({ electronApp, page }) => {
    test.setTimeout(15000) // Need extra time for AG Grid rendering

    // Load files
    const vttPath = path.join(getProjectRoot(), 'test_data', 'with-media-reference.vtt')
    await loadVTTFile(electronApp, page, vttPath)

    const audioPath = path.join(getProjectRoot(), 'test_data', 'OSR_us_000_0010_8k.wav')
    await loadMediaFile(page, audioPath)

    // Start sequential playback
    const sequentialBtn = page.locator('button.sequential-play-btn')
    await sequentialBtn.click()

    await page.waitForTimeout(50)

    // Stop sequential playback
    await expect(sequentialBtn).toHaveText(/⏸/)
    await sequentialBtn.click()

    await page.waitForTimeout(50)

    // Wait for grid to be ready with at least one row
    await page.waitForFunction(() => {
      const api = (window as any).__agGridApi
      if (!api) return false
      let count = 0
      api.forEachNode(() => count++)
      return count > 0
    }, { timeout: 5000 })

    // Click play button on first row (should use snippet mode)
    // Use a simple selector that finds the first visible play button
    const playButton = page.locator('button[title="Play snippet"]').first()
    await playButton.click()

    await page.waitForTimeout(50)

    // Should be in SEGMENTS_PLAYING mode with single-item playlist
    const mode = await page.evaluate(() => {
      const store = (window as any).__vttStore
      return {
        playbackMode: store.playbackMode,
        playlistLength: store.playlist.length
      }
    })

    expect(mode.playbackMode).toBe('SEGMENTS_PLAYING')
    expect(mode.playlistLength).toBe(1) // Single segment playlist
  })
})
