import { sharedElectronTest as test, expect } from '../helpers/shared-electron'

/**
 * Clicking a row must keep that row selected, even when a neighbouring segment's time
 * range covers the timestamp we seek to.
 *
 * Real-world shape of the bug: chunked ASR leaves adjacent segments touching or
 * overlapping by a few milliseconds. Clicking a row seeks to its `startTime`, but the
 * media element reports a position a frame earlier, which falls inside the *previous*
 * segment — so playhead-driven auto-selection moved the selection there. Under a sort
 * that scatters neighbours (speaker similarity, speaker name), that row is nowhere near
 * the one you clicked, and the next field you edit belongs to the wrong segment.
 */
test.describe('Selection stays pinned to the clicked row', () => {
  /** Segment i ends 10ms *after* segment i+1 starts, as overlapping ASR output does. */
  function makeOverlappingDocument(segmentCount: number, docId: string) {
    const segments = []
    for (let i = 0; i < segmentCount; i++) {
      segments.push({
        id: `seg_${i}`,
        startTime: i * 3,
        endTime: (i + 1) * 3 + 0.01,
        text: `Caption number ${i + 1}`,
        verified: false,
        // Interleaved speakers: sorting by speaker puts temporal neighbours far apart.
        speakerName: `Speaker ${(i % 5) + 1}`,
      })
    }
    return JSON.stringify({ metadata: { id: docId }, segments })
  }

  async function loadDocument(page: import('@playwright/test').Page, segmentCount: number, docId: string) {
    const content = makeOverlappingDocument(segmentCount, docId)
    await page.evaluate(
      ({ content, docId }) => {
        ;(window as any).$store.loadFromFile(content, `/test/${docId}.captions_json5`)
      },
      { content, docId }
    )
    await page.waitForFunction(
      (n) => (window as any).$store?.document?.segments?.length === n,
      segmentCount,
      { timeout: 5000 }
    )
    await page.waitForSelector('.ag-center-cols-container .ag-row', { timeout: 5000 })
    await page.waitForTimeout(300)
  }

  test('a clicked row survives a seek that lands inside the previous segment', async ({ page }) => {
    await loadDocument(page, 60, 'selection-pin-click')

    // Sort by speaker so the row whose range covers our timestamp is far away in the view.
    await page.evaluate(() => {
      ;(window as any).__agGridApi.applyColumnState({
        state: [{ colId: 'speakerName', sort: 'asc' }],
        defaultState: { sort: null },
      })
    })
    await page.waitForTimeout(300)

    const target = 'seg_40'

    // Click the row the way the user does.
    await page.evaluate((id) => {
      const api = (window as any).__agGridApi
      const node = api.getRowNode(id)
      api.ensureNodeVisible(node, 'middle')
      return new Promise<void>((resolve) => setTimeout(resolve, 150))
    }, target)
    await page.evaluate((id) => {
      const api = (window as any).__agGridApi
      const node = api.getRowNode(id)
      const cell = document.querySelector(
        `.ag-center-cols-container .ag-row[row-id="${id}"] .ag-cell`
      ) as HTMLElement | null
      if (cell) cell.click()
      else node.setSelected(true)
    }, target)
    await page.waitForTimeout(200)

    expect(await page.evaluate(() => (window as any).$store.selectedSegmentId)).toBe(target)

    // The media element now reports a position a few milliseconds short of the seek —
    // inside seg_39, whose range overlaps seg_40's start.
    await page.evaluate((id) => {
      const store = (window as any).$store
      const seg = store.document.segments.find((s: any) => s.id === id)
      store.setCurrentTime(seg.startTime - 0.005)
    }, target)
    await page.waitForTimeout(200)

    expect(await page.evaluate(() => (window as any).$store.selectedSegmentId)).toBe(target)
    expect(
      await page.evaluate(() =>
        (window as any).__agGridApi.getSelectedRows().map((r: any) => r.id)
      )
    ).toEqual([target])

    // And the viewport did not jump off to the other row.
    expect(
      await page.evaluate(
        (id) => !!document.querySelector(`.ag-center-cols-container .ag-row[row-id="${id}"]`),
        target
      )
    ).toBe(true)
  })

  test('playing past the clicked row hands the selection back to the playhead', async ({ page }) => {
    await loadDocument(page, 20, 'selection-pin-release')

    await page.evaluate(() => {
      const store = (window as any).$store
      store.setCurrentTime(15)
      store.selectSegment('seg_5')
    })
    await page.waitForTimeout(100)
    expect(await page.evaluate(() => (window as any).$store.selectedSegmentId)).toBe('seg_5')

    // Playback advances well past seg_5 — following the playhead is what the user means now.
    await page.evaluate(() => {
      const store = (window as any).$store
      for (const t of [15.1, 15.4, 16, 17, 18.5]) store.setCurrentTime(t)
    })
    await page.waitForTimeout(200)
    expect(await page.evaluate(() => (window as any).$store.selectedSegmentId)).toBe('seg_6')
  })
})
