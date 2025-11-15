import { test, expect, _electron as electron } from '@playwright/test'
import { ElectronApplication, Page } from '@playwright/test'
import * as path from 'path'
import { enableConsoleCapture } from './helpers/console'

test.describe('VTT Editor - Rename Speaker', () => {
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

  test('should rename speaker across multiple cues', async () => {
    // Load VTT with multiple speakers using direct store manipulation
    const loadResult = await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return { success: false, error: 'No store on window' }

      // Directly load VTT content into store
      const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:VTTCue {"id":"cue1","startTime":1,"endTime":4,"text":"Hello from Alice","speakerName":"Alice","rating":5}

cue1
00:00:01.000 --> 00:00:04.000
Hello from Alice

NOTE CAPTION_EDITOR:VTTCue {"id":"cue2","startTime":5,"endTime":8,"text":"Hello from Bob","speakerName":"Bob","rating":4}

cue2
00:00:05.000 --> 00:00:08.000
Hello from Bob

NOTE CAPTION_EDITOR:VTTCue {"id":"cue3","startTime":9,"endTime":12,"text":"Another message from Alice","speakerName":"Alice","rating":3}

cue3
00:00:09.000 --> 00:00:12.000
Another message from Alice`

      try {
        vttStore.loadFromFile(vttContent, '/test/file.vtt')
        return { success: true, segmentCount: vttStore.document.segments.length }
      } catch (error) {
        return { success: false, error: String(error) }
      }
    })

    expect(loadResult.success).toBe(true)
    expect(loadResult.segmentCount).toBe(3)

    await window.waitForTimeout(200)

    // Wait for caption count to update
    const captionCount = window.locator('h2', { hasText: 'Captions' })
    await expect(captionCount).toContainText('3', { timeout: 2000 })

    // Open rename dialog (simulating Edit menu -> Rename Speaker)
    await window.evaluate(() => {
      ;(window as any).openRenameSpeakerDialog()
    })

    await window.waitForTimeout(100)

    // Dialog should be visible
    const dialog = window.locator('.dialog-overlay')
    await expect(dialog).toBeVisible()

    // Select "Alice" from dropdown
    const dropdown = window.locator('#speaker-select')
    await dropdown.selectOption('Alice')

    // Enter new name "Alice Smith"
    const input = window.locator('#new-name-input')
    await input.fill('Alice Smith')

    // Click Rename button
    await window.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const renameBtn = buttons.find(b => b.textContent?.includes('Rename') && !b.textContent?.includes('Speaker'))
      if (renameBtn) renameBtn.click()
    })

    await window.waitForTimeout(200)

    // Verify dialog closed
    await expect(dialog).not.toBeVisible()

    // Verify speaker was renamed in the store
    const speakerNames = await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return null
      return vttStore.document.segments.map((cue: any) => cue.speakerName)
    })

    // Check that Alice was renamed to Alice Smith
    expect(speakerNames).toContain('Alice Smith')
    expect(speakerNames).not.toContain('Alice')
    expect(speakerNames).toContain('Bob') // Bob should remain unchanged
  })

  test('should not show rename dialog when no speakers exist', async () => {
    // Load VTT without speakers
    const vttContent = `WEBVTT

00:00:01.000 --> 00:00:04.000
Caption without speaker

00:00:05.000 --> 00:00:08.000
Another caption without speaker`

    await window.evaluate((content) => {
      const file = new File([content], 'test.vtt', { type: 'text/vtt' })
      const dt = new DataTransfer()
      dt.items.add(file)
      const dropZone = document.querySelector('.file-input-zone')
      if (dropZone) {
        dropZone.dispatchEvent(new DragEvent('drop', {
          bubbles: true,
          dataTransfer: dt
        }))
      }
    }, vttContent)

    await window.waitForTimeout(200)

    // Try to open rename dialog
    await window.evaluate(() => {
      ;(window as any).openRenameSpeakerDialog()
    })

    await window.waitForTimeout(100)

    // Dialog should not appear when there are no speakers
    const dialog = window.locator('.dialog-overlay')
    await expect(dialog).not.toBeVisible()
  })

  test('should close dialog when clicking Cancel', async () => {
    // Load VTT with speaker
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:VTTCue {"id":"cue1","startTime":1,"endTime":4,"text":"Hello","speakerName":"Alice"}

cue1
00:00:01.000 --> 00:00:04.000
Hello`

      vttStore.loadFromFile(vttContent, '/test/file.vtt')
    })

    await window.waitForTimeout(200)

    // Open rename dialog
    await window.evaluate(() => {
      ;(window as any).openRenameSpeakerDialog()
    })

    await window.waitForTimeout(100)

    // Dialog should be visible
    const dialog = window.locator('.dialog-overlay')
    await expect(dialog).toBeVisible()

    // Click Cancel button
    const cancelButton = window.locator('button.btn-cancel')
    await cancelButton.click()

    await window.waitForTimeout(100)

    // Dialog should be closed
    await expect(dialog).not.toBeVisible()
  })

  test('should record history entries for renamed cues', async () => {
    // Load VTT with speakers
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:VTTCue {"id":"cue1","startTime":1,"endTime":4,"text":"Message 1","speakerName":"John"}

cue1
00:00:01.000 --> 00:00:04.000
Message 1

NOTE CAPTION_EDITOR:VTTCue {"id":"cue2","startTime":5,"endTime":8,"text":"Message 2","speakerName":"John"}

cue2
00:00:05.000 --> 00:00:08.000
Message 2`

      vttStore.loadFromFile(vttContent, '/test/file.vtt')
    })

    await window.waitForTimeout(200)

    // Open rename dialog
    await window.evaluate(() => {
      ;(window as any).openRenameSpeakerDialog()
    })

    await window.waitForTimeout(100)

    // Select John and rename to Jonathan
    const dropdown = window.locator('#speaker-select')
    await dropdown.selectOption('John')

    const input = window.locator('#new-name-input')
    await input.fill('Jonathan')

    await window.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const renameBtn = buttons.find(b => b.textContent?.trim() === 'Rename')
      if (renameBtn) renameBtn.click()
    })

    await window.waitForTimeout(200)

    // Check that history entries were created
    const historyCount = await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return 0

      const history = vttStore.document.history || []
      const speakerRenamedEntries = history.filter((entry: any) => entry.action === 'speakerRenamed')
      return speakerRenamedEntries.length
    })

    // Should have 2 history entries (one for each renamed cue)
    expect(historyCount).toBe(2)
  })
})
