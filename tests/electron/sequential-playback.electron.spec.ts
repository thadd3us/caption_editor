import { test, expect, _electron as electron } from '@playwright/test'
import { ElectronApplication, Page } from '@playwright/test'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { enableConsoleCapture } from '../helpers/console'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test.describe('Sequential Playback', () => {
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

  test('should show sequential play button in table header', async () => {
    // Load a VTT file with multiple segments
    const vttPath = path.join(process.cwd(), 'test_data', 'with-media-reference.vtt')
    await window.evaluate((filePath) => {
      window.electronAPI.ipcRenderer.emit('file-opened', filePath)
    }, vttPath)

    // Wait for file to load
    await window.waitForTimeout(100)

    // Sequential play button should be visible
    const sequentialBtn = window.locator('button:has-text("Play Sequential")')
    await expect(sequentialBtn).toBeVisible()
  })

  test('should start sequential playback from top when no row selected', async () => {
    // Load a VTT file with multiple segments
    const vttPath = path.join(process.cwd(), 'test_data', 'with-media-reference.vtt')
    await window.evaluate((filePath) => {
      window.electronAPI.ipcRenderer.emit('file-opened', filePath)
    }, vttPath)

    await window.waitForTimeout(100)

    // Load media file
    const audioPath = path.join(process.cwd(), 'test_data', 'OSR_us_000_0010_8k.wav')
    await window.evaluate((filePath) => {
      window.electronAPI.ipcRenderer.emit('media-file-selected', filePath)
    }, audioPath)

    await window.waitForTimeout(100)

    // Click sequential play button
    const sequentialBtn = window.locator('button:has-text("Play Sequential")')
    await sequentialBtn.click()

    // Button should change to "Pause Sequential"
    await expect(window.locator('button:has-text("Pause Sequential")')).toBeVisible()

    // First row should be selected (auto-scroll feature)
    await window.waitForTimeout(100)
    const selectedRows = await window.locator('.ag-row.ag-row-selected').count()
    expect(selectedRows).toBeGreaterThan(0)
  })

  test('should start sequential playback from selected row', async () => {
    // Load a VTT file
    const vttPath = path.join(process.cwd(), 'test_data', 'with-media-reference.vtt')
    await window.evaluate((filePath) => {
      window.electronAPI.ipcRenderer.emit('file-opened', filePath)
    }, vttPath)

    await window.waitForTimeout(100)

    // Load media file
    const audioPath = path.join(process.cwd(), 'test_data', 'OSR_us_000_0010_8k.wav')
    await window.evaluate((filePath) => {
      window.electronAPI.ipcRenderer.emit('media-file-selected', filePath)
    }, audioPath)

    await window.waitForTimeout(100)

    // Get all rows and click the third one
    const rows = await window.locator('.ag-row').all()
    if (rows.length >= 3) {
      await rows[2].click()
      await window.waitForTimeout(50)

      // Get the text of the third row
      const thirdRowText = await rows[2].locator('[col-id="text"]').textContent()

      // Click sequential play button
      const sequentialBtn = window.locator('button:has-text("Play Sequential")')
      await sequentialBtn.click()

      await window.waitForTimeout(100)

      // Third row should still be selected (started from there)
      const selectedRowText = await window.locator('.ag-row-selected [col-id="text"]').first().textContent()
      expect(selectedRowText).toBe(thirdRowText)
    }
  })

  test('should stop sequential playback when pause button clicked', async () => {
    // Load files
    const vttPath = path.join(process.cwd(), 'test_data', 'with-media-reference.vtt')
    await window.evaluate((filePath) => {
      window.electronAPI.ipcRenderer.emit('file-opened', filePath)
    }, vttPath)

    await window.waitForTimeout(100)

    const audioPath = path.join(process.cwd(), 'test_data', 'OSR_us_000_0010_8k.wav')
    await window.evaluate((filePath) => {
      window.electronAPI.ipcRenderer.emit('media-file-selected', filePath)
    }, audioPath)

    await window.waitForTimeout(100)

    // Start sequential playback
    const playBtn = window.locator('button:has-text("Play Sequential")')
    await playBtn.click()

    // Button should change to pause
    const pauseBtn = window.locator('button:has-text("Pause Sequential")')
    await expect(pauseBtn).toBeVisible()

    // Click pause
    await pauseBtn.click()

    // Button should change back to play
    await expect(window.locator('button:has-text("Play Sequential")')).toBeVisible()
  })

  test('should play segments in table order respecting sort', async () => {
    // Load files
    const vttPath = path.join(process.cwd(), 'test_data', 'with-media-reference.vtt')
    await window.evaluate((filePath) => {
      window.electronAPI.ipcRenderer.emit('file-opened', filePath)
    }, vttPath)

    await window.waitForTimeout(100)

    const audioPath = path.join(process.cwd(), 'test_data', 'OSR_us_000_0010_8k.wav')
    await window.evaluate((filePath) => {
      window.electronAPI.ipcRenderer.emit('media-file-selected', filePath)
    }, audioPath)

    await window.waitForTimeout(100)

    // Get the grid API and capture initial order
    const initialOrder = await window.evaluate(() => {
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
    await window.locator('button:has-text("Play Sequential")').click()

    await window.waitForTimeout(100)

    // Check that the playlist matches the initial order
    const playlistOrder = await window.evaluate(() => {
      const store = (window as any).__vttStore
      return store.sequentialPlaylist
    })

    expect(playlistOrder).toEqual(initialOrder)
  })

  test('should advance to next segment during playback', async () => {
    // Load files
    const vttPath = path.join(process.cwd(), 'test_data', 'with-media-reference.vtt')
    await window.evaluate((filePath) => {
      window.electronAPI.ipcRenderer.emit('file-opened', filePath)
    }, vttPath)

    await window.waitForTimeout(100)

    const audioPath = path.join(process.cwd(), 'test_data', 'OSR_us_000_0010_8k.wav')
    await window.evaluate((filePath) => {
      window.electronAPI.ipcRenderer.emit('media-file-selected', filePath)
    }, audioPath)

    await window.waitForTimeout(100)

    // Start sequential playback
    await window.locator('button:has-text("Play Sequential")').click()

    await window.waitForTimeout(50)

    // Get initial index
    const initialIndex = await window.evaluate(() => {
      const store = (window as any).__vttStore
      return store.sequentialPlaylistIndex
    })

    // Simulate segment completion by manually advancing
    await window.evaluate(() => {
      const store = (window as any).__vttStore
      store.nextSequentialSegment()
    })

    await window.waitForTimeout(50)

    // Index should have advanced
    const newIndex = await window.evaluate(() => {
      const store = (window as any).__vttStore
      return store.sequentialPlaylistIndex
    })

    expect(newIndex).toBe(initialIndex + 1)
  })

  test('should preserve playlist order even if table is resorted', async () => {
    // Load files
    const vttPath = path.join(process.cwd(), 'test_data', 'with-media-reference.vtt')
    await window.evaluate((filePath) => {
      window.electronAPI.ipcRenderer.emit('file-opened', filePath)
    }, vttPath)

    await window.waitForTimeout(100)

    const audioPath = path.join(process.cwd(), 'test_data', 'OSR_us_000_0010_8k.wav')
    await window.evaluate((filePath) => {
      window.electronAPI.ipcRenderer.emit('media-file-selected', filePath)
    }, audioPath)

    await window.waitForTimeout(100)

    // Start sequential playback
    await window.locator('button:has-text("Play Sequential")').click()

    await window.waitForTimeout(50)

    // Get the playlist before sorting
    const playlistBefore = await window.evaluate(() => {
      const store = (window as any).__vttStore
      return [...store.sequentialPlaylist]
    })

    // Sort the table by text column (click header)
    await window.locator('.ag-header-cell:has-text("Caption")').click()

    await window.waitForTimeout(100)

    // Get the playlist after sorting
    const playlistAfter = await window.evaluate(() => {
      const store = (window as any).__vttStore
      return store.sequentialPlaylist
    })

    // Playlist should be unchanged
    expect(playlistAfter).toEqual(playlistBefore)
  })

  test('should disable sequential button when no media loaded', async () => {
    // Load only VTT file, no media
    const vttPath = path.join(process.cwd(), 'test_data', 'with-media-reference.vtt')
    await window.evaluate((filePath) => {
      window.electronAPI.ipcRenderer.emit('file-opened', filePath)
    }, vttPath)

    await window.waitForTimeout(100)

    // Sequential play button should be disabled
    const sequentialBtn = window.locator('button:has-text("Play Sequential")')
    await expect(sequentialBtn).toBeDisabled()
  })

  test('should work with single segment playback', async () => {
    // Load files
    const vttPath = path.join(process.cwd(), 'test_data', 'with-media-reference.vtt')
    await window.evaluate((filePath) => {
      window.electronAPI.ipcRenderer.emit('file-opened', filePath)
    }, vttPath)

    await window.waitForTimeout(100)

    const audioPath = path.join(process.cwd(), 'test_data', 'OSR_us_000_0010_8k.wav')
    await window.evaluate((filePath) => {
      window.electronAPI.ipcRenderer.emit('media-file-selected', filePath)
    }, audioPath)

    await window.waitForTimeout(100)

    // Start sequential playback
    await window.locator('button:has-text("Play Sequential")').click()

    await window.waitForTimeout(50)

    // Stop sequential playback
    await window.locator('button:has-text("Pause Sequential")').click()

    await window.waitForTimeout(50)

    // Click play button on individual row (should use snippet mode)
    const rows = await window.locator('.ag-row').all()
    if (rows.length > 0) {
      const playButton = rows[0].locator('button[title="Play this segment"]')
      await playButton.click()

      await window.waitForTimeout(50)

      // Should be in snippet mode, not sequential mode
      const modes = await window.evaluate(() => {
        const store = (window as any).__vttStore
        return {
          snippetMode: store.snippetMode,
          sequentialMode: store.sequentialMode
        }
      })

      expect(modes.snippetMode).toBe(true)
      expect(modes.sequentialMode).toBe(false)
    }
  })
})
