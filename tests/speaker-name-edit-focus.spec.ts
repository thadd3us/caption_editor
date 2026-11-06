import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, ElectronApplication, Page } from '@playwright/test'
import { enableConsoleCapture } from './helpers/console'
import { launchElectron } from './helpers/electron-launch'
import {
  expectGridCaptionTotal,
  expectPageValue,
  waitForCellEditorFocused,
  waitForSegmentCount,
} from './helpers/wait-helpers'
import { firstReadyWindow } from './helpers/app-ready'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test.describe('Caption Editor - Speaker Name Edit Focus and Commit', () => {
  let electronApp: ElectronApplication
  let appPage: Page

  test.beforeAll(async () => {
    // Launch Electron app using common helper once for all tests in this file
    electronApp = await launchElectron({
      env: {
        DISPLAY: process.env.DISPLAY || ':99'
      }
    })

    // Wait for the first window with a generous timeout
    appPage = await firstReadyWindow(electronApp, 60000)
    await appPage.waitForLoadState('domcontentloaded')
    enableConsoleCapture(appPage)
  })

  test.afterAll(async () => {
    if (electronApp) { await electronApp.close().catch(() => { }) }
  })

  test.beforeEach(async () => {
    // Reset the application state before each test
    await appPage.evaluate(() => {
      const vttStore = (window as any).$store
      if (vttStore) {
        vttStore.reset()
      }
      // Ensure no dangling UI elements
      const overlay = document.querySelector('.base-modal-overlay')
      if (overlay) overlay.remove()
    })
    // The reset has landed once the grid reports no rows.
    await waitForSegmentCount(appPage, 0)
  })

  test('should automatically focus input when starting to edit speaker name', async () => {
    // Load captions JSON with speaker names
    await appPage.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const captionsContent = JSON.stringify({
        metadata: { id: 'speaker-focus-1' },
        segments: [
          { id: 'cue1', startTime: 1, endTime: 4, text: 'First message', speakerName: 'Alice' },
          { id: 'cue2', startTime: 5, endTime: 8, text: 'Second message', speakerName: 'Bob' }
        ]
      }, null, 2)

      vttStore.loadFromFile(captionsContent, '/test/file.captions_json5')
    })


    await expectGridCaptionTotal(appPage, 2, 2000)

    // Start editing the speaker cell for the first row
    await appPage.evaluate(() => {
      const gridApi = (window as any).__agGridApi
      if (!gridApi) throw new Error('Grid API not available')

      gridApi.startEditingCell({
        rowIndex: 0,
        colKey: 'speakerName'
      })
    })

    // startEditingCell returns before the editor mounts and takes focus.
    await waitForCellEditorFocused(appPage, '.speaker-name-editor')
  })

  test('should commit speaker name when Enter is pressed', async () => {
    console.log('=== TEST START: should commit speaker name when Enter is pressed ===')

    // Load captions JSON with speaker names
    await appPage.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const captionsContent = JSON.stringify({
        metadata: { id: 'speaker-focus-2' },
        segments: [{ id: 'cue1', startTime: 1, endTime: 4, text: 'First message', speakerName: 'Alice' }]
      }, null, 2)

      vttStore.loadFromFile(captionsContent, '/test/file.captions_json5')
    })


    await expectGridCaptionTotal(appPage, 1, 2000)

    console.log('[TEST] Starting to edit speaker cell')

    // Start editing the speaker cell
    await appPage.evaluate(() => {
      const gridApi = (window as any).__agGridApi
      if (!gridApi) throw new Error('Grid API not available')

      console.log('[TEST] Calling startEditingCell')
      gridApi.startEditingCell({
        rowIndex: 0,
        colKey: 'speakerName'
      })
    })

    await waitForCellEditorFocused(appPage, '.speaker-name-editor')

    console.log('[TEST] Looking for input element')

    // Type a new name and press Enter
    const input = appPage.locator('.speaker-name-editor')
    await expect(input).toBeVisible()

    console.log('[TEST] Input visible, setting value to "Charlie"')

    // Use JavaScript to set value directly to avoid Playwright+Electron crash
    // with datalist in headless mode (see: https://github.com/microsoft/playwright/issues/38854)
    await appPage.evaluate(() => {
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

    // Commit is synchronous in the store, but the keypress has to make the round trip.
    await expectPageValue(
      appPage,
      () => (window as any).$store?.document.segments[0].speakerName,
      'Charlie'
    )

    // Verify the cell is no longer being edited
    const isEditing = await appPage.evaluate(() => {
      const editingCell = document.querySelector('.ag-cell-inline-editing')
      return editingCell !== null
    })

    expect(isEditing).toBe(false)

    // Verify the new name is visible in the grid
    const cellText = await appPage.evaluate(() => {
      const gridApi = (window as any).__agGridApi
      if (!gridApi) return null

      const rowNode = gridApi.getDisplayedRowAtIndex(0)
      return rowNode?.data?.speakerName
    })

    expect(cellText).toBe('Charlie')
  })


  test('should focus input immediately when double-clicking speaker cell', async () => {
    // Load captions JSON
    await appPage.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const captionsContent = JSON.stringify({
        metadata: { id: 'speaker-focus-3' },
        segments: [{ id: 'cue1', startTime: 1, endTime: 4, text: 'First message', speakerName: 'Alice' }]
      }, null, 2)

      vttStore.loadFromFile(captionsContent, '/test/file.captions_json5')
    })

    await expectGridCaptionTotal(appPage, 1, 2000)

    // Double-click on the speaker cell
    const speakerCell = appPage.locator('.ag-cell[col-id="speakerName"]').first()
    await speakerCell.dblclick()

    const input = appPage.locator('.speaker-name-editor')
    await expect(input).toBeFocused({ timeout: 5000 })
    await expect(input).toHaveValue('Alice')
    await expect(input).toBeVisible()

    const hasInputFocus = await appPage.evaluate(() => {
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
    await appPage.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const captionsContent = JSON.stringify({
        metadata: { id: 'speaker-focus-4' },
        segments: [{ id: 'cue1', startTime: 1, endTime: 4, text: 'First message', speakerName: 'Alice' }]
      }, null, 2)

      vttStore.loadFromFile(captionsContent, '/test/file.captions_json5')
    })

    await expectGridCaptionTotal(appPage, 1, 2000)

    // Double-click on the speaker cell
    const speakerCell = appPage.locator('.ag-cell[col-id="speakerName"]').first()
    await speakerCell.dblclick()

    const input = appPage.locator('.speaker-name-editor')
    await expect(input).toBeFocused({ timeout: 5000 })

    await input.pressSequentially('Bob', { delay: 50 })

    // Verify the input now contains what we typed
    await expect(input).toHaveValue('Bob')
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
    await appPage.evaluate(() => {
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

      store.loadFromFile(captionsContent, '/test/file.captions_json5')
    })

    await expectGridCaptionTotal(appPage, 3, 2000)

    // Start editing the speaker cell for the first row.
    await appPage.evaluate(() => {
      const gridApi = (window as any).__agGridApi
      if (!gridApi) throw new Error('Grid API not available')
      gridApi.startEditingCell({
        rowIndex: 0,
        colKey: 'speakerName'
      })
    })

    const input = appPage.locator('.speaker-name-editor')
    await expect(input).toBeVisible()
    await expect(input).toBeFocused({ timeout: 5000 })

    // Simulate "selecting from autocomplete" by setting the value to an existing name.
    await appPage.evaluate(() => {
      const input = document.querySelector('.speaker-name-editor') as HTMLInputElement | null
      if (!input) throw new Error('speaker-name-editor input not found')
      input.value = 'Bob'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await input.press('Enter')

    // Verify store updated.
    const speakerName = await appPage.evaluate(() => {
      const store = (window as any).$store
      return store?.document?.segments?.[0]?.speakerName
    })
    expect(speakerName).toBe('Bob')
  })

  /**
   * Regression: focusing a speaker cell and typing to enter edit mode must not drop the first
   * character (e.g. "James" becoming "ames"). Existing tests use startEditingCell() or set the
   * value in JS, which does not reproduce type-to-edit.
   *
   */
  test('regression: first character is kept when typing to start editing an empty speaker cell', async () => {
    await appPage.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const captionsContent = JSON.stringify(
        {
          metadata: { id: 'speaker-first-key-regression' },
          segments: [
            { id: 'cue1', startTime: 0, endTime: 1, text: 'First line' },
            { id: 'cue2', startTime: 2, endTime: 3, text: 'Second line', speakerName: 'Bob' }
          ]
        },
        null,
        2
      )

      vttStore.loadFromFile(captionsContent, '/test/speaker-first-key.captions_json5')
    })

    await expectGridCaptionTotal(appPage, 2, 2000)

    const speakerCell = appPage.locator('.ag-cell[col-id="speakerName"]').first()
    await speakerCell.click()
    await expect(speakerCell).toBeFocused()
    await appPage.keyboard.type('James', { delay: 40 })

    const editor = appPage.locator('.speaker-name-editor')
    await expect(editor).toBeVisible({ timeout: 5000 })
    await expect(editor).toHaveValue('James')
  })

  /**
   * Regression: with many rows, committing the speaker editor via Enter must not scroll the grid
   * so the edited row is off-screen (reported jump to ~rows 37–42 on a ~54-row file).
   *
   * Uses test_data/about-time-speaker-regression.captions_json5 (copy of a real project file).
   * Auto-scroll is turned off so follow-playhead scrolling does not mask the bug.
   *
   */
  test('regression: committing speaker edit does not scroll the edited row off-screen (large document) (About Time fixture, 54 segments)', async () => {
    const fixturePath = path.join(__dirname, '../test_data/about-time-speaker-regression.captions_json5')
    const content = fs.readFileSync(fixturePath, 'utf8')

    await appPage.evaluate(
      ({ fileContent }: { fileContent: string }) => {
        const vttStore = (window as any).$store
        vttStore.loadFromFile(fileContent, '/test/about-time-speaker-regression.captions_json5')
      },
      { fileContent: content }
    )

    await expectGridCaptionTotal(appPage, 54, 15000)

    const autoScroll = appPage.getByRole('checkbox', { name: /Auto-scroll/i })
    await autoScroll.uncheck()

    await appPage.evaluate(() => {
      const vp = document.querySelector('.ag-body-viewport') as HTMLElement | null
      if (vp) vp.scrollTop = 0
    })
    await expectPageValue(
      appPage,
      () => (document.querySelector('.ag-body-viewport') as HTMLElement | null)?.scrollTop ?? -1,
      0
    )

    const expectedTopRowId = await appPage.evaluate(() => (window as any).$store.document.segments[0].id)

    await appPage.evaluate(() => {
      const gridApi = (window as any).__agGridApi
      if (!gridApi) throw new Error('Grid API not available')
      gridApi.startEditingCell({ rowIndex: 0, colKey: 'speakerName' })
    })

    const input = appPage.locator('.speaker-name-editor')
    await expect(input).toBeVisible({ timeout: 5000 })
    await appPage.evaluate(() => {
      const el = document.querySelector('.speaker-name-editor') as HTMLInputElement | null
      if (!el) throw new Error('speaker-name-editor not found')
      el.value = 'Pat'
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await input.press('Enter')
    await expectPageValue(
      appPage,
      () => (window as any).$store.document.segments[0].speakerName,
      'Pat'
    )

    await expectPageValue(
      appPage,
      () => (window as any).__agGridApi?.getDisplayedRowAtIndex?.(0)?.data?.id ?? null,
      expectedTopRowId
    )

    // Still at the top: committing the edit must not scroll the edited row away.
    const scrollAfter = await appPage.evaluate(
      () => (document.querySelector('.ag-body-viewport') as HTMLElement | null)?.scrollTop ?? -1
    )
    expect(scrollAfter).toBe(0)
  })
})
