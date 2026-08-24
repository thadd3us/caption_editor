/**
 * "Come back to where you left off" (Lightroom-style).
 *
 * The playhead and the selected row are persisted in the document's `uiState` and
 * restored on reopen. Selection is keyed by segment UUID, so it survives re-sorting
 * and filtering — the two things that would break a row-index-based approach.
 */
import { sharedElectronTest as test, expect } from '../helpers/shared-electron'
import * as path from 'path'
import * as fs from 'fs/promises'
import { getProjectRoot } from '../helpers/project-root'
import { parseCaptionsFileContent } from '../helpers/parseCaptionsFileContent'

const SEGMENTS = [
  { id: 'seg-1', index: 0, startTime: 0, endTime: 5, text: 'Alpha' },
  { id: 'seg-2', index: 1, startTime: 5, endTime: 10, text: 'Bravo' },
  { id: 'seg-3', index: 2, startTime: 10, endTime: 15, text: 'Charlie' },
  { id: 'seg-4', index: 3, startTime: 15, endTime: 20, text: 'Delta' }
]

async function writeFixture(name: string): Promise<string> {
  const dir = path.join(getProjectRoot(), 'test_data', 'temp-view-state')
  await fs.mkdir(dir, { recursive: true })
  const filePath = path.join(dir, name)
  await fs.writeFile(
    filePath,
    JSON.stringify({ metadata: { id: `view-state-${name}` }, segments: SEGMENTS }, null, 2),
    'utf-8'
  )
  return filePath
}

/** Load a captions file into the renderer the way a file drop would. */
async function loadDocument(page: any, filePath: string) {
  await page.evaluate(async (p: string) => {
    const store = (window as any).$store
    store.reset()
    const results = await window.electronAPI!.processDroppedFiles([p])
    for (const res of results) {
      if (res.type === 'captions_json5' && res.content) store.loadFromFile(res.content, res.filePath)
    }
  }, filePath)
  await page.waitForTimeout(200)
}

test.describe('View state persistence', () => {
  test('playhead and selection are written into uiState on save', async ({ page }) => {
    const filePath = await writeFixture('save.captions_json5')
    await loadDocument(page, filePath)

    await page.evaluate(() => {
      const store = (window as any).$store
      store.setCurrentTime(12.5)
      store.selectSegment('seg-3')
    })

    const saved = await page.evaluate(() => (window as any).$store.exportToString())
    const doc = parseCaptionsFileContent(saved) as any

    expect(doc.uiState.playheadSeconds).toBe(12.5)
    expect(doc.uiState.selectedSegmentId).toBe('seg-3')
  })

  test('reopening restores the playhead and reselects the row in the grid', async ({ page }) => {
    const filePath = await writeFixture('restore.captions_json5')
    await loadDocument(page, filePath)

    // Move to a spot and select a row, then save it back to disk.
    await page.evaluate(() => {
      const store = (window as any).$store
      store.setCurrentTime(12.5)
      store.selectSegment('seg-3')
    })
    await page.evaluate(async () => {
      const store = (window as any).$store
      await window.electronAPI!.saveExistingFile({
        filePath: store.document.filePath,
        content: store.exportToString()
      })
    })

    // Reopen from scratch.
    await loadDocument(page, filePath)

    const restored = await page.evaluate(() => {
      const store = (window as any).$store
      return { currentTime: store.currentTime, selectedSegmentId: store.selectedSegmentId }
    })
    expect(restored.currentTime).toBe(12.5)
    expect(restored.selectedSegmentId).toBe('seg-3')

    // ...and the grid actually shows it as selected.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const api = (window as any).__agGridApi
            return api?.getSelectedRows().map((r: any) => r.id) ?? []
          }),
        { timeout: 5000 }
      )
      .toEqual(['seg-3'])
  })

  test('selection survives re-sorting the grid', async ({ page }) => {
    const filePath = await writeFixture('sorted.captions_json5')
    await loadDocument(page, filePath)

    await page.evaluate(() => {
      const store = (window as any).$store
      store.selectSegment('seg-3')
      // Sort descending by start time, so seg-3 is no longer the third row.
      ;(window as any).__agGridApi.applyColumnState({
        state: [{ colId: 'startTime', sort: 'desc' }],
        defaultState: { sort: null }
      })
    })
    await page.waitForTimeout(200)

    await page.evaluate(async () => {
      const store = (window as any).$store
      await window.electronAPI!.saveExistingFile({
        filePath: store.document.filePath,
        content: store.exportToString()
      })
    })

    await loadDocument(page, filePath)

    // The UUID, not the row position, is what was persisted.
    expect(await page.evaluate(() => (window as any).$store.selectedSegmentId)).toBe('seg-3')

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const api = (window as any).__agGridApi
            return api?.getSelectedRows().map((r: any) => r.id) ?? []
          }),
        { timeout: 5000 }
      )
      .toEqual(['seg-3'])
  })

  test('a selection filtered out of view is kept, not discarded', async ({ page }) => {
    const filePath = await writeFixture('filtered.captions_json5')
    await loadDocument(page, filePath)

    await page.evaluate(() => {
      const store = (window as any).$store
      store.selectSegment('seg-3')
      // Filter to rows that cannot include "Charlie".
      ;(window as any).__agGridApi.setFilterModel({
        text: { filterType: 'text', type: 'contains', filter: 'Alpha' }
      })
    })
    await page.waitForTimeout(200)

    await page.evaluate(async () => {
      const store = (window as any).$store
      await window.electronAPI!.saveExistingFile({
        filePath: store.document.filePath,
        content: store.exportToString()
      })
    })

    await loadDocument(page, filePath)
    await page.waitForTimeout(400)

    // Still remembered in the store even though the row is not on screen...
    expect(await page.evaluate(() => (window as any).$store.selectedSegmentId)).toBe('seg-3')
    expect(
      await page.evaluate(() => (window as any).__agGridApi.getSelectedRows().length)
    ).toBe(0)

    // ...and clearing the filter puts the user back on it.
    await page.evaluate(() => (window as any).__agGridApi.setFilterModel(null))
    await page.waitForTimeout(300)

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const api = (window as any).__agGridApi
            return api?.getSelectedRows().map((r: any) => r.id) ?? []
          }),
        { timeout: 5000 }
      )
      .toEqual(['seg-3'])
  })

  test('panel sizes round-trip with the document', async ({ page }) => {
    const filePath = await writeFixture('layout.captions_json5')
    await loadDocument(page, filePath)

    await page.evaluate(() => {
      const store = (window as any).$store
      store.leftPanelWidth = 37
      store.captionHeight = 210
    })

    const saved = await page.evaluate(() => (window as any).$store.exportToString())
    const doc = parseCaptionsFileContent(saved) as any
    expect(doc.uiState.leftPanelWidth).toBe(37)
    expect(doc.uiState.captionHeight).toBe(210)

    await page.evaluate(async (content: string) => {
      const store = (window as any).$store
      const p = store.document.filePath
      await window.electronAPI!.saveExistingFile({ filePath: p, content })
    }, saved)

    await loadDocument(page, filePath)
    const restored = await page.evaluate(() => {
      const store = (window as any).$store
      return { leftPanelWidth: store.leftPanelWidth, captionHeight: store.captionHeight }
    })
    expect(restored).toEqual({ leftPanelWidth: 37, captionHeight: 210 })
  })

  test('view-only changes never mark the document as having unsaved content', async ({ page }) => {
    const filePath = await writeFixture('viewdirty.captions_json5')
    await loadDocument(page, filePath)

    const state = await page.evaluate(() => {
      const store = (window as any).$store
      store.setCurrentTime(8)
      store.selectSegment('seg-2')
      store.leftPanelWidth = 45
      return { isDirty: store.isDirty, viewDirty: store.viewDirty }
    })

    expect(state.isDirty).toBe(false)
    expect(state.viewDirty).toBe(true)
  })
})
