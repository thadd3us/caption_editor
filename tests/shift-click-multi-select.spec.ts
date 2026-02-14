import { sharedElectronTest as test, expect } from './helpers/shared-electron'

test.describe('VTT Editor - Shift-Click Multi-Select', () => {
  test('should select range of rows with shift-click and bulk set speaker', async ({ page }) => {
    const window = page
    // Load VTT with multiple cues
    const loadResult = await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return { success: false, error: 'No store on window' }

      const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:VTTCue {"id":"cue1","startTime":1,"endTime":4,"text":"First message","rating":5}

cue1
00:00:01.000 --> 00:00:04.000
First message

NOTE CAPTION_EDITOR:VTTCue {"id":"cue2","startTime":5,"endTime":8,"text":"Second message","rating":4}

cue2
00:00:05.000 --> 00:00:08.000
Second message

NOTE CAPTION_EDITOR:VTTCue {"id":"cue3","startTime":9,"endTime":12,"text":"Third message","rating":3}

cue3
00:00:09.000 --> 00:00:12.000
Third message

NOTE CAPTION_EDITOR:VTTCue {"id":"cue4","startTime":13,"endTime":16,"text":"Fourth message","rating":2}

cue4
00:00:13.000 --> 00:00:16.000
Fourth message

NOTE CAPTION_EDITOR:VTTCue {"id":"cue5","startTime":17,"endTime":20,"text":"Fifth message","rating":1}

cue5
00:00:17.000 --> 00:00:20.000
Fifth message`

      try {
        vttStore.loadFromFile(vttContent, '/test/file.vtt')
        return { success: true, segmentCount: vttStore.document.segments.length }
      } catch (error) {
        return { success: false, error: String(error) }
      }
    })

    expect(loadResult.success).toBe(true)
    expect(loadResult.segmentCount).toBe(5)

    // Wait for rows to render
    await window.waitForSelector('.ag-row', { timeout: 5000 })

    // Click first row to select it (use .ag-center-cols-container to avoid pinned row duplicates)
    const firstRow = window.locator('.ag-center-cols-container .ag-row[row-index="0"]')
    await firstRow.click()

    // Verify first row is selected
    await expect(firstRow).toHaveClass(/ag-row-selected/)

    // Shift-click the fourth row to select rows 1-4
    const fourthRow = window.locator('.ag-center-cols-container .ag-row[row-index="3"]')
    await fourthRow.click({ modifiers: ['Shift'] })

    // Wait a moment for selection to stabilize
    await window.waitForTimeout(200)

    // Verify all 4 rows are selected
    const selectedRows = await window.evaluate(() => {
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

    // Now use bulk set speaker on the selected rows
    // Store selected rows for App.vue and open dialog
    await window.evaluate(() => {
      const gridApi = (window as any).__agGridApi
      const selectedRows = gridApi.getSelectedRows().map((r: any) => ({
        id: r.id,
        text: r.text,
        speakerName: r.speakerName
      }))
      ;(window as any).__captionTableSelectedRows = selectedRows

      window.dispatchEvent(new CustomEvent('openBulkSetSpeakerDialog', {
        detail: { rowCount: selectedRows.length }
      }))
    })

    // Dialog should be visible
    const dialog = window.locator('.base-modal-overlay')
    await expect(dialog).toBeVisible()

    // Check that row count is displayed correctly
    await expect(dialog).toContainText('4 selected rows')

    // Enter speaker name
    const input = window.locator('#speaker-name-input')
    await input.fill('Bob')

    // Click Set Speaker button
    await window.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const setBtn = buttons.find(b => b.textContent?.includes('Set Speaker'))
      if (setBtn) setBtn.click()
    })

    // Verify dialog closed
    await expect(dialog).not.toBeVisible()

    // Verify speaker was set for the 4 selected rows
    const speakerNames = await window.evaluate(() => {
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
    const window = page
    // Load VTT with multiple cues
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) throw new Error('No store')

      const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:VTTCue {"id":"cue1","startTime":1,"endTime":4,"text":"First message"}

cue1
00:00:01.000 --> 00:00:04.000
First message

NOTE CAPTION_EDITOR:VTTCue {"id":"cue2","startTime":5,"endTime":8,"text":"Second message"}

cue2
00:00:05.000 --> 00:00:08.000
Second message

NOTE CAPTION_EDITOR:VTTCue {"id":"cue3","startTime":9,"endTime":12,"text":"Third message"}

cue3
00:00:09.000 --> 00:00:12.000
Third message

NOTE CAPTION_EDITOR:VTTCue {"id":"cue4","startTime":13,"endTime":16,"text":"Fourth message"}

cue4
00:00:13.000 --> 00:00:16.000
Fourth message

NOTE CAPTION_EDITOR:VTTCue {"id":"cue5","startTime":17,"endTime":20,"text":"Fifth message"}

cue5
00:00:17.000 --> 00:00:20.000
Fifth message`

      vttStore.loadFromFile(vttContent, '/test/file.vtt')
    })

    // Wait for rows to render
    await window.waitForSelector('.ag-row', { timeout: 5000 })

    // Click second row to select it
    const secondRow = window.locator('.ag-center-cols-container .ag-row[row-index="1"]')
    await secondRow.click()
    await expect(secondRow).toHaveClass(/ag-row-selected/)

    // Shift-click the fourth row's speaker column to select rows 2-4
    const fourthRowSpeakerCell = window.locator('.ag-center-cols-container .ag-row[row-index="3"] [col-id="speakerName"]')
    await fourthRowSpeakerCell.click({ modifiers: ['Shift'] })

    // Wait for selection to stabilize
    await window.waitForTimeout(200)

    // Verify 3 rows selected (rows 2, 3, 4 = indices 1, 2, 3)
    const selectedCount = await window.evaluate(() => {
      const gridApi = (window as any).__agGridApi
      return gridApi?.getSelectedRows().length ?? 0
    })
    expect(selectedCount).toBe(3)

    // Press Enter to start editing the speaker cell
    await window.keyboard.press('Enter')

    // Wait for editor to appear (it's a combobox)
    const editorInput = window.locator('role=combobox')
    await expect(editorInput).toBeVisible({ timeout: 2000 })

    // Type speaker name and press Enter
    await editorInput.pressSequentially('Bob')
    await editorInput.press('Enter')

    // Wait for edit to complete
    await window.waitForTimeout(200)

    // Verify speaker was set for rows 2-4 only
    const speakerNames = await window.evaluate(() => {
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
