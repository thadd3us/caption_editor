import { sharedElectronTest as test, expect } from './helpers/shared-electron'

test.describe('Caption Editor - Speaker Name Autocomplete', () => {
  test('should show autocomplete datalist in bulk set speaker dialog', async ({ page }) => {
    const window = page
    // Load captions JSON with segments that have speaker names
    await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return

      const captionsContent = JSON.stringify({
        metadata: { id: 'speaker-autocomplete-1' },
        segments: [
          { id: 'seg1', startTime: 1, endTime: 4, text: 'First message', speakerName: 'Alice' },
          { id: 'seg2', startTime: 5, endTime: 8, text: 'Second message', speakerName: 'Alice' },
          { id: 'seg3', startTime: 9, endTime: 12, text: 'Third message', speakerName: 'Bob' }
        ]
      }, null, 2)

      store.loadFromFile(captionsContent, '/test/file.captions.json')
    })

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 3
    })

    // Open bulk set speaker dialog
    await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return

      const segments = store.document.segments
      const selectedRows = [
        { id: segments[0].id, text: segments[0].text, speakerName: segments[0].speakerName }
      ]

      ;(window as any).__captionTableSelectedRows = selectedRows

      window.dispatchEvent(new CustomEvent('openBulkSetSpeakerDialog', {
        detail: { rowCount: selectedRows.length }
      }))
    })

    // Dialog should be visible
    const dialog = window.locator('.base-modal-overlay')
    await expect(dialog).toBeVisible()

    // Check that datalist element exists
    const datalist = window.locator('datalist')
    await expect(datalist).toBeAttached()

    // Check that datalist has options for existing speakers
    const options = await window.evaluate(() => {
      const datalist = document.querySelector('datalist')
      if (!datalist) return []
      return Array.from(datalist.querySelectorAll('option')).map(opt => opt.value)
    })

    // Should have Alice (2 occurrences) and Bob (1 occurrence)
    expect(options).toContain('Alice')
    expect(options).toContain('Bob')
    // Alice should appear first (most common)
    expect(options[0]).toBe('Alice')
  })

  test('should provide all speakers in datalist for browser filtering', async ({ page }) => {
    const window = page
    // Load captions JSON with various speaker names
    await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return

      const captionsContent = JSON.stringify({
        metadata: { id: 'speaker-autocomplete-2' },
        segments: [
          { id: 'seg1', startTime: 1, endTime: 4, text: 'First', speakerName: 'Alice' },
          { id: 'seg2', startTime: 5, endTime: 8, text: 'Second', speakerName: 'Anna' },
          { id: 'seg3', startTime: 9, endTime: 12, text: 'Third', speakerName: 'Bob' }
        ]
      }, null, 2)

      store.loadFromFile(captionsContent, '/test/file.captions.json')
    })

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 3
    })

    // Open dialog
    await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return

      const segments = store.document.segments
      const selectedRows = [{ id: segments[0].id, text: segments[0].text, speakerName: segments[0].speakerName }]

      ;(window as any).__captionTableSelectedRows = selectedRows
      window.dispatchEvent(new CustomEvent('openBulkSetSpeakerDialog', {
        detail: { rowCount: selectedRows.length }
      }))
    })

    await window.waitForSelector('.base-modal-overlay', { state: 'visible' })

    // Datalist should contain ALL speakers regardless of input
    // The browser handles filtering based on user input automatically
    const options = await window.evaluate(() => {
      const datalist = document.querySelector('datalist')
      if (!datalist) return []
      return Array.from(datalist.querySelectorAll('option')).map(opt => opt.value)
    })

    expect(options).toContain('Alice')
    expect(options).toContain('Anna')
    expect(options).toContain('Bob')
    expect(options.length).toBe(3)
  })

  test('should allow typing new speaker name not in autocomplete', async ({ page }) => {
    const window = page
    // Load captions JSON with existing speakers
    await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return

      const captionsContent = JSON.stringify({
        metadata: { id: 'speaker-autocomplete-3' },
        segments: [{ id: 'seg1', startTime: 1, endTime: 4, text: 'First', speakerName: 'Alice' }]
      }, null, 2)

      store.loadFromFile(captionsContent, '/test/file.captions.json')
    })

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 1
    })

    // Open dialog
    await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return

      const segments = store.document.segments
      const selectedRows = [{ id: segments[0].id, text: segments[0].text, speakerName: segments[0].speakerName }]

      ;(window as any).__captionTableSelectedRows = selectedRows
      window.dispatchEvent(new CustomEvent('openBulkSetSpeakerDialog', {
        detail: { rowCount: selectedRows.length }
      }))
    })

    await window.waitForSelector('.base-modal-overlay', { state: 'visible' })

    // Type a completely new name
    const input = window.locator('#speaker-name-input')
    await input.fill('Charlie')

    // Submit
    await window.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const setBtn = buttons.find(b => b.textContent?.includes('Set Speaker'))
      if (setBtn) setBtn.click()
    })

    await window.waitForSelector('.base-modal-overlay', { state: 'hidden' })

    // Verify new speaker name was set
    const speakerNames = await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return null
      return store.document.segments.map((segment: any) => segment.speakerName)
    })

    expect(speakerNames[0]).toBe('Charlie')
  })

  test('should sort speakers by frequency (most common first)', async ({ page }) => {
    const window = page
    // Load captions JSON with speakers of varying frequencies
    await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return

      const captionsContent = JSON.stringify({
        metadata: { id: 'speaker-autocomplete-4' },
        segments: [
          { id: 'seg1', startTime: 1, endTime: 2, text: '1', speakerName: 'Alice' },
          { id: 'seg2', startTime: 2, endTime: 3, text: '2', speakerName: 'Alice' },
          { id: 'seg3', startTime: 3, endTime: 4, text: '3', speakerName: 'Alice' },
          { id: 'seg4', startTime: 4, endTime: 5, text: '4', speakerName: 'Bob' },
          { id: 'seg5', startTime: 5, endTime: 6, text: '5', speakerName: 'Bob' },
          { id: 'seg6', startTime: 6, endTime: 7, text: '6', speakerName: 'Charlie' }
        ]
      }, null, 2)

      store.loadFromFile(captionsContent, '/test/file.captions.json')
    })

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 6
    })

    // Open dialog
    await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return

      const segments = store.document.segments
      const selectedRows = [{ id: segments[0].id, text: segments[0].text, speakerName: segments[0].speakerName }]

      ;(window as any).__captionTableSelectedRows = selectedRows
      window.dispatchEvent(new CustomEvent('openBulkSetSpeakerDialog', {
        detail: { rowCount: selectedRows.length }
      }))
    })

    await window.waitForSelector('.base-modal-overlay', { state: 'visible' })

    // Check that datalist options are sorted by frequency
    const options = await window.evaluate(() => {
      const datalist = document.querySelector('datalist')
      if (!datalist) return []
      return Array.from(datalist.querySelectorAll('option')).map(opt => opt.value)
    })

    // Alice (3), Bob (2), Charlie (1)
    expect(options[0]).toBe('Alice')
    expect(options[1]).toBe('Bob')
    expect(options[2]).toBe('Charlie')
  })

  test('should autocomplete in AG Grid cell editor', async ({ page }) => {
    const window = page
    // Load captions JSON with speaker names
    await window.evaluate(() => {
      const store = (window as any).$store
      if (!store) return

      const captionsContent = JSON.stringify({
        metadata: { id: 'speaker-autocomplete-grid' },
        segments: [
          { id: 'seg1', startTime: 1, endTime: 4, text: 'First', speakerName: 'Alice' },
          { id: 'seg2', startTime: 5, endTime: 8, text: 'Second', speakerName: 'Bob' }
        ]
      }, null, 2)

      store.loadFromFile(captionsContent, '/test/file.captions.json')
    })

    // Wait for grid to render
    const captionCount = window.locator('h2', { hasText: 'Captions' })
    await expect(captionCount).toContainText('2', { timeout: 2000 })

    // Double-click on the speaker cell to start editing
    await window.evaluate(() => {
      const gridApi = (window as any).__agGridApi
      if (!gridApi) throw new Error('Grid API not available')

      // Get the first row's speaker cell
      const rowNode = gridApi.getDisplayedRowAtIndex(0)
      if (!rowNode) throw new Error('Row node not found')

      // Start editing the speaker column
      gridApi.startEditingCell({
        rowIndex: 0,
        colKey: 'speakerName'
      })
    })

    // Wait for editing cell
    await window.waitForSelector('.ag-cell-inline-editing', { state: 'visible' })

    // Debug: Check what's actually in the editing cell
    const cellEditorHTML = await window.evaluate(() => {
      const editingCell = document.querySelector('.ag-cell-inline-editing')
      if (!editingCell) return 'NO_EDITING_CELL'
      return editingCell.innerHTML
    })
    console.log('Cell editor HTML:', cellEditorHTML)

    // Check that the cell editor has a datalist
    const cellEditorDatalist = await window.evaluate(() => {
      // The datalist might be a sibling or child of the input
      const datalist = document.querySelector('datalist')
      return datalist !== null
    })

    expect(cellEditorDatalist).toBe(true)

    // Check datalist has options
    const cellEditorOptions = await window.evaluate(() => {
      const datalist = document.querySelector('.ag-cell-inline-editing datalist')
      if (!datalist) return []
      return Array.from(datalist.querySelectorAll('option')).map(opt => opt.value)
    })

    expect(cellEditorOptions).toContain('Alice')
    expect(cellEditorOptions).toContain('Bob')
  })
})
