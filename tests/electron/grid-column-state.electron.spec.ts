import { sharedElectronTest as test, expect } from '../helpers/shared-electron'
import * as path from 'path'
import * as fs from 'fs/promises'
import { getProjectRoot } from '../helpers/project-root'

test.describe('Grid Column State - Persist and restore column visibility', () => {
  test('should save column state with hidden columns and restore on re-open', async ({ page }) => {
    const tempDir = path.join(getProjectRoot(), 'test_data/temp')
    await fs.mkdir(tempDir, { recursive: true })
    const tempCaptionsPath = path.join(tempDir, 'test-column-state.captions_json')

    const initialCaptions = JSON.stringify({
      metadata: { id: 'col-state-test-1' },
      segments: [
        { id: 'seg-1', startTime: 0.0, endTime: 3.0, text: 'First caption', rating: 3 },
        { id: 'seg-2', startTime: 3.0, endTime: 6.0, text: 'Second caption', rating: 5 }
      ]
    })
    await fs.writeFile(tempCaptionsPath, initialCaptions, 'utf-8')

    // Load the document
    await page.evaluate(({ content, filePath }) => {
      const store = (window as any).$store
      store.loadFromFile(content, filePath)
    }, { content: initialCaptions, filePath: tempCaptionsPath })

    // Wait for grid to be ready
    await page.waitForFunction(() => !!(window as any).__agGridApi, { timeout: 5000 })

    // Verify Rating column is initially visible
    const initialRatingVisible = await page.evaluate(() => {
      const api = (window as any).__agGridApi
      const col = api.getColumn('rating')
      return col ? col.isVisible() : null
    })
    expect(initialRatingVisible).toBe(true)

    // Hide the Rating column
    await page.evaluate(() => {
      const api = (window as any).__agGridApi
      api.setColumnsVisible(['rating'], false)
    })

    // Verify it's now hidden
    const ratingHiddenAfterToggle = await page.evaluate(() => {
      const api = (window as any).__agGridApi
      return api.getColumn('rating')?.isVisible()
    })
    expect(ratingHiddenAfterToggle).toBe(false)

    // Also hide endTime
    await page.evaluate(() => {
      const api = (window as any).__agGridApi
      api.setColumnsVisible(['endTime'], false)
    })

    // Export (simulating save) — this should include uiState
    const exportedContent = await page.evaluate(() => {
      const store = (window as any).$store
      return store.exportToString()
    })

    const exported = JSON.parse(exportedContent)
    expect(exported.uiState).toBeDefined()
    expect(exported.uiState.columnState).toBeDefined()

    // Verify the exported column state has rating and endTime hidden
    const ratingState = exported.uiState.columnState.find((c: any) => c.colId === 'rating')
    expect(ratingState?.hide).toBe(true)

    const endTimeState = exported.uiState.columnState.find((c: any) => c.colId === 'endTime')
    expect(endTimeState?.hide).toBe(true)

    // Verify visible columns are NOT hidden in the state
    const textState = exported.uiState.columnState.find((c: any) => c.colId === 'text')
    expect(textState?.hide).toBeFalsy()  // false or undefined

    // Now simulate re-opening: reset the store, then load the saved content
    await page.evaluate(() => {
      const store = (window as any).$store
      store.reset()
    })

    // Small delay for grid to process reset
    await page.waitForTimeout(100)

    // Reload with the saved content (which includes uiState)
    await page.evaluate(({ content, filePath }) => {
      const store = (window as any).$store
      store.loadFromFile(content, filePath)
    }, { content: exportedContent, filePath: tempCaptionsPath })

    // Wait for grid state to be restored (restoreGridState uses setTimeout(0))
    await page.waitForTimeout(200)

    // Verify Rating column is still hidden after restore
    const ratingVisibleAfterRestore = await page.evaluate(() => {
      const api = (window as any).__agGridApi
      return api.getColumn('rating')?.isVisible()
    })
    expect(ratingVisibleAfterRestore).toBe(false)

    // Verify endTime is still hidden
    const endTimeVisibleAfterRestore = await page.evaluate(() => {
      const api = (window as any).__agGridApi
      return api.getColumn('endTime')?.isVisible()
    })
    expect(endTimeVisibleAfterRestore).toBe(false)

    // Verify text column is still visible
    const textVisibleAfterRestore = await page.evaluate(() => {
      const api = (window as any).__agGridApi
      return api.getColumn('text')?.isVisible()
    })
    expect(textVisibleAfterRestore).toBe(true)

    // Cleanup
    await fs.rm(tempCaptionsPath, { force: true })
  })

  test('should not fail when opening a file without uiState', async ({ page }) => {
    const tempDir = path.join(getProjectRoot(), 'test_data/temp')
    await fs.mkdir(tempDir, { recursive: true })
    const tempCaptionsPath = path.join(tempDir, 'test-no-ui-state.captions_json')

    // Old-format file with no uiState
    const oldFormatCaptions = JSON.stringify({
      metadata: { id: 'old-doc-1' },
      segments: [
        { id: 'seg-1', startTime: 0.0, endTime: 3.0, text: 'Old caption' }
      ]
    })
    await fs.writeFile(tempCaptionsPath, oldFormatCaptions, 'utf-8')

    await page.evaluate(({ content, filePath }) => {
      const store = (window as any).$store
      store.loadFromFile(content, filePath)
    }, { content: oldFormatCaptions, filePath: tempCaptionsPath })

    await page.waitForFunction(() => !!(window as any).__agGridApi, { timeout: 5000 })
    await page.waitForTimeout(200)

    // All default columns should be visible
    const ratingVisible = await page.evaluate(() => {
      const api = (window as any).__agGridApi
      return api.getColumn('rating')?.isVisible()
    })
    expect(ratingVisible).toBe(true)

    // Cleanup
    await fs.rm(tempCaptionsPath, { force: true })
  })
})
