import { test, expect } from '@playwright/test'
import { ElectronApplication, Page } from '@playwright/test'
import { enableConsoleCapture } from './helpers/console'
import { launchElectron } from './helpers/electron-launch'

test.describe('Caption Editor - Speaker Name Edit Focus and Commit', () => {
  let electronApp: ElectronApplication
  let window: Page

  test.beforeAll(async () => {
    // Launch Electron app using common helper once for all tests in this file
    electronApp = await launchElectron({
      env: {
        DISPLAY: process.env.DISPLAY || ':99'
      }
    })

    // Wait for the first window with a generous timeout
    window = await electronApp.firstWindow({ timeout: 60000 })
    await window.waitForLoadState('domcontentloaded')
    enableConsoleCapture(window)
  })

  test.afterAll(async () => {
    if (electronApp) { await electronApp.close().catch(() => { }) }
  })

  test.beforeEach(async () => {
    // Reset the application state before each test
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (vttStore) {
        vttStore.reset()
      }
      // Ensure no dangling UI elements
      const overlay = document.querySelector('.base-modal-overlay')
      if (overlay) overlay.remove()
    })
    // AG Grid might need a moment to settle after reset
    await window.waitForTimeout(500)
  })

  test('should automatically focus input when starting to edit speaker name', async () => {
    // Load captions JSON with speaker names
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const captionsContent = JSON.stringify({
        metadata: { id: 'speaker-focus-1' },
        segments: [
          { id: 'cue1', startTime: 1, endTime: 4, text: 'First message', speakerName: 'Alice' },
          { id: 'cue2', startTime: 5, endTime: 8, text: 'Second message', speakerName: 'Bob' }
        ]
      }, null, 2)

      vttStore.loadFromFile(captionsContent, '/test/file.captions_json')
    })

    await window.waitForTimeout(200)

    // Wait for grid to render
    const captionCount = window.locator('h2', { hasText: 'Captions' })
    await expect(captionCount).toContainText('2', { timeout: 2000 })

    // Start editing the speaker cell for the first row
    await window.evaluate(() => {
      const gridApi = (window as any).__agGridApi
      if (!gridApi) throw new Error('Grid API not available')

      gridApi.startEditingCell({
        rowIndex: 0,
        colKey: 'speakerName'
      })
    })

    await window.waitForTimeout(100)

    // Check that the input has focus
    const hasInputFocus = await window.evaluate(() => {
      const activeElement = document.activeElement
      const input = document.querySelector('.speaker-name-editor')
      return activeElement === input
    })

    expect(hasInputFocus).toBe(true)
  })

  test('should commit speaker name when Enter is pressed', async () => {
    console.log('=== TEST START: should commit speaker name when Enter is pressed ===')

    // Load captions JSON with speaker names
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const captionsContent = JSON.stringify({
        metadata: { id: 'speaker-focus-2' },
        segments: [{ id: 'cue1', startTime: 1, endTime: 4, text: 'First message', speakerName: 'Alice' }]
      }, null, 2)

      vttStore.loadFromFile(captionsContent, '/test/file.captions_json')
    })

    await window.waitForTimeout(200)

    // Wait for grid to render
    const captionCount = window.locator('h2', { hasText: 'Captions' })
    await expect(captionCount).toContainText('1', { timeout: 2000 })

    console.log('[TEST] Starting to edit speaker cell')

    // Start editing the speaker cell
    await window.evaluate(() => {
      const gridApi = (window as any).__agGridApi
      if (!gridApi) throw new Error('Grid API not available')

      console.log('[TEST] Calling startEditingCell')
      gridApi.startEditingCell({
        rowIndex: 0,
        colKey: 'speakerName'
      })
    })

    await window.waitForTimeout(100)

    console.log('[TEST] Looking for input element')

    // Type a new name and press Enter
    const input = window.locator('.speaker-name-editor')
    await expect(input).toBeVisible()

    console.log('[TEST] Input visible, setting value to "Charlie"')

    // Use JavaScript to set value directly to avoid Playwright+Electron crash
    // with datalist in headless mode (see: https://github.com/microsoft/playwright/issues/38854)
    await window.evaluate(() => {
      const input = document.querySelector('.speaker-name-editor') as HTMLInputElement
      if (input) {
        input.value = 'Charlie'
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
    })

    // Check input value before pressing Enter
    const inputValueBefore = await input.inputValue()
    console.log('[TEST] Input value before Enter:', inputValueBefore)

    console.log('[TEST] Pressing Enter key')

    // Press Enter to commit
    await input.press('Enter')

    console.log('[TEST] Waiting 200ms after Enter')
    await window.waitForTimeout(200)

    // Verify the name was updated in the store
    console.log('[TEST] Checking store for updated speaker name')
    const speakerName = await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) {
        console.log('[TEST] No store found!')
        return null
      }
      const name = vttStore.document.segments[0].speakerName
      console.log('[TEST] Store speaker name:', name)
      return name
    })

    console.log('[TEST] Final speakerName value:', speakerName)
    expect(speakerName).toBe('Charlie')

    // Verify the cell is no longer being edited
    const isEditing = await window.evaluate(() => {
      const editingCell = document.querySelector('.ag-cell-inline-editing')
      return editingCell !== null
    })

    expect(isEditing).toBe(false)

    // Verify the new name is visible in the grid
    const cellText = await window.evaluate(() => {
      const gridApi = (window as any).__agGridApi
      if (!gridApi) return null

      const rowNode = gridApi.getDisplayedRowAtIndex(0)
      return rowNode?.data?.speakerName
    })

    expect(cellText).toBe('Charlie')
  })


  test('should focus input immediately when double-clicking speaker cell', async () => {
    // Load captions JSON
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const captionsContent = JSON.stringify({
        metadata: { id: 'speaker-focus-3' },
        segments: [{ id: 'cue1', startTime: 1, endTime: 4, text: 'First message', speakerName: 'Alice' }]
      }, null, 2)

      vttStore.loadFromFile(captionsContent, '/test/file.captions_json')
    })

    await window.waitForTimeout(200)

    // Double-click on the speaker cell
    const speakerCell = window.locator('.ag-cell[col-id="speakerName"]').first()
    await speakerCell.dblclick()

    const input = window.locator('.speaker-name-editor')
    await expect(input).toBeFocused({ timeout: 5000 })
    await expect(input).toHaveValue('Alice')
    await expect(input).toBeVisible()

    const hasInputFocus = await window.evaluate(() => {
      const activeElement = document.activeElement
      const input = document.querySelector('.speaker-name-editor')
      return activeElement === input
    })

    expect(hasInputFocus).toBe(true)

    // The text should be selected (value should match initial value)
    const inputValue = await input.inputValue()
    expect(inputValue).toBe('Alice')
  })

  test('should allow typing immediately after double-click without manual focus', async () => {
    // Load captions JSON
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const captionsContent = JSON.stringify({
        metadata: { id: 'speaker-focus-4' },
        segments: [{ id: 'cue1', startTime: 1, endTime: 4, text: 'First message', speakerName: 'Alice' }]
      }, null, 2)

      vttStore.loadFromFile(captionsContent, '/test/file.captions_json')
    })

    await window.waitForTimeout(200)

    // Double-click on the speaker cell
    const speakerCell = window.locator('.ag-cell[col-id="speakerName"]').first()
    await speakerCell.dblclick()

    const input = window.locator('.speaker-name-editor')
    await expect(input).toBeFocused({ timeout: 5000 })

    // Wait a bit for AG Grid internal events to settle before typing
    await window.waitForTimeout(200)
    await input.pressSequentially('Bob', { delay: 50 })

    await window.waitForTimeout(100)

    // Verify the input now contains what we typed
    const inputValue = await input.inputValue()

    // If text was selected, typing "Bob" would replace "Alice" with "Bob"
    // If text wasn't selected, typing "Bob" would append, giving "AliceBob"
    // We expect the text to be replaced since select() is called
    expect(inputValue).toBe('Bob')
  })

  test('should commit speaker name when selecting from autocomplete', async () => {
    // NOTE: Playwright+Electron has a known crash bug with <datalist> (see playwright#38854).
    // In E2E tests, the app disables datalist rendering, but we can still validate the
    // "choose an existing speaker name and commit" behavior by setting the value and pressing Enter.

    // Load captions JSON with multiple existing speaker names.
    await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return

      const captionsContent = JSON.stringify({
        metadata: { id: 'speaker-autocomplete-1' },
        segments: [
          { id: 'cue1', startTime: 1, endTime: 4, text: 'First message', speakerName: 'Alice' },
          { id: 'cue2', startTime: 5, endTime: 8, text: 'Second message', speakerName: 'Bob' },
          { id: 'cue3', startTime: 9, endTime: 12, text: 'Third message', speakerName: 'Alice' }
        ]
      }, null, 2)

      store.loadFromFile(captionsContent, '/test/file.captions_json')
    })

    const captionCount = window.locator('h2', { hasText: 'Captions' })
    await expect(captionCount).toContainText('3', { timeout: 2000 })

    // Start editing the speaker cell for the first row.
    await window.evaluate(() => {
      const gridApi = (window as any).__agGridApi
      if (!gridApi) throw new Error('Grid API not available')
      gridApi.startEditingCell({
        rowIndex: 0,
        colKey: 'speakerName'
      })
    })

    const input = window.locator('.speaker-name-editor')
    await expect(input).toBeVisible()
    await expect(input).toBeFocused({ timeout: 5000 })

    // Simulate "selecting from autocomplete" by setting the value to an existing name.
    await window.evaluate(() => {
      const input = document.querySelector('.speaker-name-editor') as HTMLInputElement | null
      if (!input) throw new Error('speaker-name-editor input not found')
      input.value = 'Bob'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await input.press('Enter')
    await window.waitForTimeout(200)

    // Verify store updated.
    const speakerName = await window.evaluate(() => {
      const store = (window as any).$store
      return store?.document?.segments?.[0]?.speakerName
    })
    expect(speakerName).toBe('Bob')
  })
})
