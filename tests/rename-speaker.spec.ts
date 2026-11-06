import { sharedElectronTest as test, expect } from './helpers/shared-electron'
import { expectGridCaptionTotal } from './helpers/wait-helpers'
import type { Page } from '@playwright/test'

test.describe('Caption Editor - Rename Speaker', () => {
  let appPage: Page

  test.beforeEach(async ({ page }) => {
    appPage = page
  })

  test('should rename speaker across multiple segments', async () => {
    // Load captions JSON with multiple speakers using direct store manipulation
    const loadResult = await appPage.evaluate(() => {
      const store = window.$store
      if (!store) return { success: false, error: 'No store on window' }

      const captionsContent = JSON.stringify({
        metadata: { id: 'doc1' },
        segments: [
          { id: 'seg1', startTime: 1, endTime: 4, text: 'Hello from Alice', speakerName: 'Alice', rating: 5 },
          { id: 'seg2', startTime: 5, endTime: 8, text: 'Hello from Bob', speakerName: 'Bob', rating: 4 },
          { id: 'seg3', startTime: 9, endTime: 12, text: 'Another message from Alice', speakerName: 'Alice', rating: 3 }
        ]
      })

      try {
        store.loadFromFile(captionsContent, '/test/file.captions_json5')
        return { success: true, segmentCount: store.document.segments.length }
      } catch (error) {
        return { success: false, error: String(error) }
      }
    })

    expect(loadResult.success).toBe(true)
    expect(loadResult.segmentCount).toBe(3)

    await expectGridCaptionTotal(appPage, 3, 2000)

    // Open rename dialog (simulating Edit menu -> Rename Speaker)
    await appPage.evaluate(() => {
      ;window.openRenameSpeakerDialog()
    })

    // Dialog should be visible
    const dialog = appPage.locator('.base-modal-overlay')
    await expect(dialog).toBeVisible()

    // Select "Alice" from dropdown
    const dropdown = appPage.locator('#speaker-select')
    await dropdown.selectOption('Alice')

    // Enter new name "Alice Smith"
    const input = appPage.locator('#new-name-input')
    await input.fill('Alice Smith')

    // Click Rename button
    await appPage.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const renameBtn = buttons.find(b => b.textContent?.includes('Rename') && !b.textContent?.includes('Speaker'))
      if (renameBtn) renameBtn.click()
    })

    // Verify dialog closed
    await expect(dialog).not.toBeVisible()

    // Verify speaker was renamed in the store
    const speakerNames = await appPage.evaluate(() => {
      const store = window.$store
      if (!store) return null
      return store.document.segments.map((segment: any) => segment.speakerName)
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
    await appPage.evaluate(() => {
      const store = window.$store
      store.reset()
    })
    await appPage.waitForFunction(() => { const store = window.$store; return store?.document !== undefined })

    // Check initial state before loading
    const beforeState = await appPage.evaluate(() => {
      const store = window.$store
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
    await appPage.evaluate(() => {
      const store = window.$store
      const captionsContent = JSON.stringify({
        metadata: { id: 'doc1' },
        segments: [
          { id: 'seg1', startTime: 1, endTime: 4, text: 'Caption without speaker' },
          { id: 'seg2', startTime: 5, endTime: 8, text: 'Another caption without speaker' }
        ]
      })
      store.loadFromFile(captionsContent, '/test/no-speakers.captions_json5')
    })

    await appPage.waitForFunction(() => {
      const store = window.$store
      return store?.document?.segments?.length === 2
    })

    // Check state after loading
    const afterState = await appPage.evaluate(() => {
      const store = window.$store
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
    const dialogOpenResult = await appPage.evaluate(() => {
      const store = window.$store
      const hasSpeakers = store.document.segments.some(
        (segment: any) => segment.speakerName && segment.speakerName.trim() !== ''
      )
      console.log('[APP] hasSpeakers check:', hasSpeakers)
      ;window.openRenameSpeakerDialog()
      return { hasSpeakers }
    })
    console.log('Dialog open result:', dialogOpenResult)

    // Check dialog visibility
    const dialog = appPage.locator('.base-modal-overlay')
    const isVisible = await dialog.isVisible()
    console.log(`Dialog visibility: ${isVisible} (expected: false)`)

    // Dialog should not appear when there are no speakers
    await expect(dialog).not.toBeVisible()
  })

  test('should close dialog when clicking Cancel', async () => {
    // Load captions JSON with speaker
    await appPage.evaluate(() => {
      const store = window.$store
      if (!store) return

      const captionsContent = JSON.stringify({
        metadata: { id: 'doc1' },
        segments: [{ id: 'seg1', startTime: 1, endTime: 4, text: 'Hello', speakerName: 'Alice' }]
      })

      store.loadFromFile(captionsContent, '/test/file.captions_json5')
    })

    await appPage.waitForFunction(() => {
      const store = window.$store
      return store?.document?.segments?.length === 1
    })

    // Open rename dialog
    await appPage.evaluate(() => {
      ;window.openRenameSpeakerDialog()
    })

    // Dialog should be visible
    const dialog = appPage.locator('.base-modal-overlay')
    await expect(dialog).toBeVisible()

    // Click Cancel button
    const cancelButton = appPage.locator('button.dialog-button-secondary')
    await cancelButton.click()

    // Dialog should be closed
    await expect(dialog).not.toBeVisible()
  })

  test('should record history entries for renamed segments', async () => {
    // Load captions JSON with speakers
    await appPage.evaluate(() => {
      const store = window.$store
      if (!store) return

      const captionsContent = JSON.stringify({
        metadata: { id: 'doc1' },
        segments: [
          { id: 'seg1', startTime: 1, endTime: 4, text: 'Message 1', speakerName: 'John' },
          { id: 'seg2', startTime: 5, endTime: 8, text: 'Message 2', speakerName: 'John' }
        ]
      })

      store.loadFromFile(captionsContent, '/test/file.captions_json5')
    })

    await appPage.waitForFunction(() => {
      const store = window.$store
      return store?.document?.segments?.length === 2
    })

    // Open rename dialog
    await appPage.evaluate(() => {
      ;window.openRenameSpeakerDialog()
    })

    // Wait for dialog
    await appPage.waitForSelector('.base-modal-overlay', { state: 'visible' })

    // Select John and rename to Jonathan
    const dropdown = appPage.locator('#speaker-select')
    await dropdown.selectOption('John')

    const input = appPage.locator('#new-name-input')
    await input.fill('Jonathan')

    await appPage.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const renameBtn = buttons.find(b => b.textContent?.trim() === 'Rename')
      if (renameBtn) renameBtn.click()
    })

    // Wait for dialog to close
    await appPage.waitForSelector('.base-modal-overlay', { state: 'hidden' })

    // Check that history entries were created
    const historyCount = await appPage.evaluate(() => {
      const store = window.$store
      if (!store) return 0

      const history = store.document.history || []
      const speakerRenamedEntries = history.filter((entry: any) => entry.action === 'speakerRenamed')
      return speakerRenamedEntries.length
    })

    // Should have 2 history entries (one for each renamed segment)
    expect(historyCount).toBe(2)
  })
})
