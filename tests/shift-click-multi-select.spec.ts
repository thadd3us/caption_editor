import { sharedElectronTest as test, expect } from './helpers/shared-electron'
import { waitForSelectedRowCount, expectPageValue } from './helpers/wait-helpers'

test.describe('Caption Editor - Shift-Click Multi-Select', () => {
  test('should select range of rows with shift-click and set speaker on all selected', async ({ page }) => {
    // Load captions JSON with multiple segments
    const loadResult = await page.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return { success: false, error: 'No store on window' }

      const captionsContent = JSON.stringify({
        metadata: { id: 'shift-click-1' },
        segments: [
          { id: 'cue1', startTime: 1, endTime: 4, text: 'First message', rating: 5 },
          { id: 'cue2', startTime: 5, endTime: 8, text: 'Second message', rating: 4 },
          { id: 'cue3', startTime: 9, endTime: 12, text: 'Third message', rating: 3 },
          { id: 'cue4', startTime: 13, endTime: 16, text: 'Fourth message', rating: 2 },
          { id: 'cue5', startTime: 17, endTime: 20, text: 'Fifth message', rating: 1 }
        ]
      }, null, 2)

      try {
        vttStore.loadFromFile(captionsContent, '/test/file.captions_json5')
        return { success: true, segmentCount: vttStore.document.segments.length }
      } catch (error) {
        return { success: false, error: String(error) }
      }
    })

    expect(loadResult.success).toBe(true)
    expect(loadResult.segmentCount).toBe(5)

    // Wait for rows to render
    await page.waitForSelector('.ag-row', { timeout: 5000 })

    // Click first row to select it (use .ag-center-cols-container to avoid pinned row duplicates)
    const firstRow = page.locator('.ag-center-cols-container .ag-row[row-index="0"]')
    await firstRow.click()

    // Verify first row is selected
    await expect(firstRow).toHaveClass(/ag-row-selected/)

    // Shift-click the fourth row to select rows 1-4
    const fourthRow = page.locator('.ag-center-cols-container .ag-row[row-index="3"]')
    await fourthRow.click({ modifiers: ['Shift'] })

    await waitForSelectedRowCount(page, 4)

    // Verify all 4 rows are selected
    const selectedRows = await page.evaluate(() => {
      const gridApi = (window as any).__agGridApi
      if (!gridApi) return []
      return gridApi.getSelectedRows().map((r: any) => r.id)
    })

    expect(selectedRows.length).toBe(4)
    expect(selectedRows).toContain('cue1')
    expect(selectedRows).toContain('cue2')
    expect(selectedRows).toContain('cue3')
    expect(selectedRows).toContain('cue4')
    expect(selectedRows).not.toContain('cue5')

    // Edit speaker on first selected row — applies to all selected rows
    await page.evaluate(() => {
      const gridApi = (window as any).__agGridApi
      if (!gridApi) throw new Error('Grid API not available')
      gridApi.startEditingCell({ rowIndex: 0, colKey: 'speakerName' })
    })

    const editorInput = page.locator('.speaker-name-editor')
    await expect(editorInput).toBeVisible({ timeout: 5000 })
    await page.evaluate(() => {
      const input = document.querySelector('.speaker-name-editor') as HTMLInputElement | null
      if (!input) throw new Error('speaker-name-editor input not found')
      input.value = 'Bob'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await editorInput.press('Enter')
    await expectPageValue(
      page,
      () => (window as any).$store.document.segments.filter((s: any) => s.speakerName === 'Bob').length,
      4
    )

    // Verify speaker was set for the 4 selected rows
    const speakerNames = await page.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return null
      return vttStore.document.segments.map((s: any) => ({
        id: s.id,
        speakerName: s.speakerName
      }))
    })

    expect(speakerNames).not.toBeNull()
    // First 4 rows should have speaker "Bob"
    expect(speakerNames.find((s: any) => s.id === 'cue1').speakerName).toBe('Bob')
    expect(speakerNames.find((s: any) => s.id === 'cue2').speakerName).toBe('Bob')
    expect(speakerNames.find((s: any) => s.id === 'cue3').speakerName).toBe('Bob')
    expect(speakerNames.find((s: any) => s.id === 'cue4').speakerName).toBe('Bob')
    // Fifth row should NOT have speaker set
    expect(speakerNames.find((s: any) => s.id === 'cue5').speakerName).toBeFalsy()
  })

  test('should edit speaker for multi-selected rows via keyboard', async ({ page }) => {
    // Load captions JSON with multiple segments
    await page.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) throw new Error('No store')

      const captionsContent = JSON.stringify({
        metadata: { id: 'shift-click-2' },
        segments: [
          { id: 'cue1', startTime: 1, endTime: 4, text: 'First message' },
          { id: 'cue2', startTime: 5, endTime: 8, text: 'Second message' },
          { id: 'cue3', startTime: 9, endTime: 12, text: 'Third message' },
          { id: 'cue4', startTime: 13, endTime: 16, text: 'Fourth message' },
          { id: 'cue5', startTime: 17, endTime: 20, text: 'Fifth message' }
        ]
      }, null, 2)

      vttStore.loadFromFile(captionsContent, '/test/file.captions_json5')
    })

    // Wait for rows to render
    await page.waitForSelector('.ag-row', { timeout: 5000 })

    // Click second row to select it
    const secondRow = page.locator('.ag-center-cols-container .ag-row[row-index="1"]')
    await secondRow.click()
    await expect(secondRow).toHaveClass(/ag-row-selected/)

    // Shift-click the fourth row's speaker column to select rows 2-4
    const fourthRowSpeakerCell = page.locator('.ag-center-cols-container .ag-row[row-index="3"] [col-id="speakerName"]')
    await fourthRowSpeakerCell.click({ modifiers: ['Shift'] })

    await waitForSelectedRowCount(page, 3)

    // Verify 3 rows selected (rows 2, 3, 4 = indices 1, 2, 3)
    const selectedCount = await page.evaluate(() => {
      const gridApi = (window as any).__agGridApi
      return gridApi?.getSelectedRows().length ?? 0
    })
    expect(selectedCount).toBe(3)

    // Start editing the speaker cell via grid API (more reliable than keyboard focus)
    await page.evaluate(() => {
      const gridApi = (window as any).__agGridApi
      if (!gridApi) throw new Error('Grid API not available')
      gridApi.startEditingCell({
        rowIndex: 1, // second displayed row (cue2)
        colKey: 'speakerName'
      })
    })

    // Wait for editor to appear
    const editorInput = page.locator('.speaker-name-editor')
    await expect(editorInput).toBeVisible({ timeout: 5000 })

    // Type speaker name and press Enter
    await page.evaluate(() => {
      const input = document.querySelector('.speaker-name-editor') as HTMLInputElement | null
      if (!input) throw new Error('speaker-name-editor input not found')
      input.value = 'Bob'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await editorInput.press('Enter')

    await expectPageValue(
      page,
      () => (window as any).$store.document.segments.filter((s: any) => s.speakerName === 'Bob').length,
      3
    )

    // Verify speaker was set for rows 2-4 only
    const speakerNames = await page.evaluate(() => {
      const vttStore = (window as any).$store
      return vttStore.document.segments.map((s: any) => ({
        id: s.id,
        speakerName: s.speakerName
      }))
    })

    expect(speakerNames.find((s: any) => s.id === 'cue1').speakerName).toBeFalsy() // Row 1 - not selected
    expect(speakerNames.find((s: any) => s.id === 'cue2').speakerName).toBe('Bob') // Row 2
    expect(speakerNames.find((s: any) => s.id === 'cue3').speakerName).toBe('Bob') // Row 3
    expect(speakerNames.find((s: any) => s.id === 'cue4').speakerName).toBe('Bob') // Row 4
    expect(speakerNames.find((s: any) => s.id === 'cue5').speakerName).toBeFalsy() // Row 5 - not selected
  })
})
