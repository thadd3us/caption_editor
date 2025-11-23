import { test, expect, _electron as electron } from '@playwright/test'
import { ElectronApplication, Page } from '@playwright/test'
import * as path from 'path'
import { enableConsoleCapture } from './helpers/console'

test.describe('VTT Editor - Speaker Name Edit Focus and Commit', () => {
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

    // Start editing the speaker cell
    await window.evaluate(() => {
      const gridApi = (window as any).__agGridApi
      if (!gridApi) throw new Error('Grid API not available')

      gridApi.startEditingCell({
        rowIndex: 0,
        colKey: 'speakerName'
      })
    })

    await window.waitForTimeout(100)

    // Type a new name and press Enter
    const input = window.locator('.speaker-name-editor')
    await expect(input).toBeVisible()

    // Clear the input and type new name
    await input.fill('Charlie')

    // Press Enter to commit
    await input.press('Enter')

    await window.waitForTimeout(200)

    // Verify the name was updated in the store
    const speakerName = await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return null
      return vttStore.document.segments[0].speakerName
    })

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

    await input.fill('Alice')

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

    await window.waitForTimeout(100)

    // Check that input is visible and has focus
    const input = window.locator('.speaker-name-editor')
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

    // Small delay to allow editor to appear
    await window.waitForTimeout(50)

    // Type immediately without manually clicking the input
    // If focus is not automatic, this would fail or type into wrong element
    await window.keyboard.type('Bob')

    await window.waitForTimeout(100)

    // Verify the input now contains what we typed
    const input = window.locator('.speaker-name-editor')
    const inputValue = await input.inputValue()

    // If text was selected, typing "Bob" would replace "Alice" with "Bob"
    // If text wasn't selected, typing "Bob" would append, giving "AliceBob"
    // We expect the text to be replaced since select() is called
    expect(inputValue).toBe('Bob')
  })
})
