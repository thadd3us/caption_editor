import { sharedElectronTest as test, expect } from './helpers/shared-electron'
import type { Page } from '@playwright/test'

test.describe('Caption Editor - Rename Speaker', () => {
  let window: Page

  test.beforeEach(async ({ page }) => {
    window = page
  })

  test('should rename speaker across multiple cues', async () => {
    // Load captions JSON with multiple speakers using direct store manipulation
    const loadResult = await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return { success: false, error: 'No store on window' }

      const captionsContent = JSON.stringify({
        metadata: { id: 'doc1' },
        segments: [
          { id: 'cue1', startTime: 1, endTime: 4, text: 'Hello from Alice', speakerName: 'Alice', rating: 5 },
          { id: 'cue2', startTime: 5, endTime: 8, text: 'Hello from Bob', speakerName: 'Bob', rating: 4 },
          { id: 'cue3', startTime: 9, endTime: 12, text: 'Another message from Alice', speakerName: 'Alice', rating: 3 }
        ]
      })

      try {
        vttStore.loadFromFile(captionsContent, '/test/file.captions.json')
        return { success: true, segmentCount: vttStore.document.segments.length }
      } catch (error) {
        return { success: false, error: String(error) }
      }
    })

    expect(loadResult.success).toBe(true)
    expect(loadResult.segmentCount).toBe(3)

    // Wait for caption count to update
    const captionCount = window.locator('h2', { hasText: 'Captions' })
    await expect(captionCount).toContainText('3', { timeout: 2000 })

    // Open rename dialog (simulating Edit menu -> Rename Speaker)
    await window.evaluate(() => {
      ;(window as any).openRenameSpeakerDialog()
    })

    // Dialog should be visible
    const dialog = window.locator('.base-modal-overlay')
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
    console.log('=== TEST START: No speakers dialog test ===')

    // Reset store to clean state before test
    console.log('Resetting store to clean state...')
    await window.evaluate(() => {
      const store = (window as any).$store
      store.reset()
    })
    await window.waitForFunction(() => { const store = (window as any).$store; return store?.document !== undefined })

    // Check initial state before loading
    const beforeState = await window.evaluate(() => {
      const store = (window as any).$store
      return {
        segmentCount: store.document.segments.length,
        segments: store.document.segments.map((s: any) => ({
          speakerName: s.speakerName,
          text: s.text
        }))
      }
    })
    console.log('State after reset (should be empty):', JSON.stringify(beforeState, null, 2))

    // Load captions JSON without speakers using store directly
    console.log('Loading captions without speakers')
    await window.evaluate(() => {
      const store = (window as any).$store
      const captionsContent = JSON.stringify({
        metadata: { id: 'doc1' },
        segments: [
          { id: 'seg1', startTime: 1, endTime: 4, text: 'Caption without speaker' },
          { id: 'seg2', startTime: 5, endTime: 8, text: 'Another caption without speaker' }
        ]
      })
      store.loadFromFile(captionsContent, '/test/no-speakers.captions.json')
    })

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 2
    })

    // Check state after loading
    const afterState = await window.evaluate(() => {
      const store = (window as any).$store
      const segments = store.document.segments
      return {
        segmentCount: segments.length,
        segments: segments.map((s: any) => ({
          speakerName: s.speakerName,
          text: s.text
        })),
        hasSpeakers: segments.some((s: any) => s.speakerName && s.speakerName.trim() !== '')
      }
    })
    console.log('State AFTER loading VTT:', JSON.stringify(afterState, null, 2))

    // Try to open rename dialog
    console.log('Attempting to open rename speaker dialog...')
    const dialogOpenResult = await window.evaluate(() => {
      const store = (window as any).$store
      const hasSpeakers = store.document.segments.some(
        (segment: any) => segment.speakerName && segment.speakerName.trim() !== ''
      )
      console.log('[APP] hasSpeakers check:', hasSpeakers)
      ;(window as any).openRenameSpeakerDialog()
      return { hasSpeakers }
    })
    console.log('Dialog open result:', dialogOpenResult)

    // Check dialog visibility
    const dialog = window.locator('.base-modal-overlay')
    const isVisible = await dialog.isVisible()
    console.log(`Dialog visibility: ${isVisible} (expected: false)`)

    // Dialog should not appear when there are no speakers
    await expect(dialog).not.toBeVisible()
  })

  test('should close dialog when clicking Cancel', async () => {
    // Load captions JSON with speaker
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const captionsContent = JSON.stringify({
        metadata: { id: 'doc1' },
        segments: [{ id: 'cue1', startTime: 1, endTime: 4, text: 'Hello', speakerName: 'Alice' }]
      })

      vttStore.loadFromFile(captionsContent, '/test/file.captions.json')
    })

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 1
    })

    // Open rename dialog
    await window.evaluate(() => {
      ;(window as any).openRenameSpeakerDialog()
    })

    // Dialog should be visible
    const dialog = window.locator('.base-modal-overlay')
    await expect(dialog).toBeVisible()

    // Click Cancel button
    const cancelButton = window.locator('button.dialog-button-secondary')
    await cancelButton.click()

    // Dialog should be closed
    await expect(dialog).not.toBeVisible()
  })

  test('should record history entries for renamed cues', async () => {
    // Load captions JSON with speakers
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const captionsContent = JSON.stringify({
        metadata: { id: 'doc1' },
        segments: [
          { id: 'cue1', startTime: 1, endTime: 4, text: 'Message 1', speakerName: 'John' },
          { id: 'cue2', startTime: 5, endTime: 8, text: 'Message 2', speakerName: 'John' }
        ]
      })

      vttStore.loadFromFile(captionsContent, '/test/file.captions.json')
    })

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 2
    })

    // Open rename dialog
    await window.evaluate(() => {
      ;(window as any).openRenameSpeakerDialog()
    })

    // Wait for dialog
    await window.waitForSelector('.base-modal-overlay', { state: 'visible' })

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

    // Wait for dialog to close
    await window.waitForSelector('.base-modal-overlay', { state: 'hidden' })

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
