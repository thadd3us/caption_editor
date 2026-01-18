import { test, expect, _electron as electron } from '@playwright/test'
import { ElectronApplication, Page } from '@playwright/test'
import * as path from 'path'
import { enableConsoleCapture } from './helpers/console'
import { launchElectron } from './helpers/electron-launch'

test.describe('VTT Editor - Speaker Name Edit Focus and Commit', () => {
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
    // Load VTT with speaker names
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:VTTCue {"id":"cue1","startTime":1,"endTime":4,"text":"First message","speakerName":"Alice"}

cue1
00:00:01.000 --> 00:00:04.000
First message

NOTE CAPTION_EDITOR:VTTCue {"id":"cue2","startTime":5,"endTime":8,"text":"Second message","speakerName":"Bob"}

cue2
00:00:05.000 --> 00:00:08.000
Second message`

      vttStore.loadFromFile(vttContent, '/test/file.vtt')
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

    // Load VTT with speaker names
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:VTTCue {"id":"cue1","startTime":1,"endTime":4,"text":"First message","speakerName":"Alice"}

cue1
00:00:01.000 --> 00:00:04.000
First message`

      vttStore.loadFromFile(vttContent, '/test/file.vtt')
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

    console.log('[TEST] Input visible, filling with "Charlie"')

    // Clear the input and type new name
    await input.fill('Charlie')

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

  test('should commit speaker name when selecting from autocomplete', async () => {
    // Load VTT with multiple speaker names
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:VTTCue {"id":"cue1","startTime":1,"endTime":4,"text":"First message","speakerName":"Alice"}

cue1
00:00:01.000 --> 00:00:04.000
First message

NOTE CAPTION_EDITOR:VTTCue {"id":"cue2","startTime":5,"endTime":8,"text":"Second message","speakerName":"Bob"}

cue2
00:00:05.000 --> 00:00:08.000
Second message

NOTE CAPTION_EDITOR:VTTCue {"id":"cue3","startTime":9,"endTime":12,"text":"Third message","speakerName":""}

cue3
00:00:09.000 --> 00:00:12.000
Third message`

      vttStore.loadFromFile(vttContent, '/test/file.vtt')
    })

    await window.waitForTimeout(200)

    // Start editing the speaker cell for the third row (empty speaker)
    await window.evaluate(() => {
      const gridApi = (window as any).__agGridApi
      if (!gridApi) throw new Error('Grid API not available')

      gridApi.startEditingCell({
        rowIndex: 2,
        colKey: 'speakerName'
      })
    })

    await window.waitForTimeout(100)

    // Type "A" and then select "Alice" by typing the full name
    const input = window.locator('.speaker-name-editor')
    await expect(input).toBeVisible()

    // Clear the input and type new name
    await input.click()
    await window.keyboard.press('Control+A')
    await window.keyboard.press('Backspace')
    await input.pressSequentially('Alice', { delay: 50 })

    // Press Enter to commit
    await input.press('Enter')

    await window.waitForTimeout(200)

    // Verify the name was updated in the store
    const speakerName = await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return null
      return vttStore.document.segments[2].speakerName
    })

    expect(speakerName).toBe('Alice')
  })

  test('should focus input immediately when double-clicking speaker cell', async () => {
    // Load VTT
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:VTTCue {"id":"cue1","startTime":1,"endTime":4,"text":"First message","speakerName":"Alice"}

cue1
00:00:01.000 --> 00:00:04.000
First message`

      vttStore.loadFromFile(vttContent, '/test/file.vtt')
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
    // Load VTT
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:VTTCue {"id":"cue1","startTime":1,"endTime":4,"text":"First message","speakerName":"Alice"}

cue1
00:00:01.000 --> 00:00:04.000
First message`

      vttStore.loadFromFile(vttContent, '/test/file.vtt')
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
})
