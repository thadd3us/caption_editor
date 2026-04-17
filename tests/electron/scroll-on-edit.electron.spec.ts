import { sharedElectronTest as test, expect } from '../helpers/shared-electron'

/**
 * Regression test for AG Grid scroll bug:
 * After scrolling to the end of a large document and back to the top,
 * editing a cell (e.g. toggling Verified) causes the grid to scroll
 * to around row 9-10 instead of staying put.
 *
 * Root cause: rapid sequential setCurrentTime calls (as from a scrub bar drag)
 * leave AG Grid with a "remembered" scroll position that it restores whenever
 * rowData is replaced (e.g. on a verified-toggle store update).
 *
 * Key: a single setCurrentTime jump does NOT reproduce the bug —
 * it requires many rapid calls stepping through intermediate positions,
 * which is what happens during a real scrub bar drag.
 */
test.describe('Scroll stability on cell edit', () => {

  function makeSyntheticDocument(segmentCount: number, docId: string) {
    const segments = []
    for (let i = 0; i < segmentCount; i++) {
      segments.push({
        id: `seg_${i}`,
        startTime: i * 3,
        endTime: (i + 1) * 3,
        text: `Caption number ${i + 1} - some text content here`,
        verified: false,
        speakerName: `Speaker ${(i % 3) + 1}`,
      })
    }
    return JSON.stringify({ metadata: { id: docId }, segments })
  }

  async function loadDocument(page: import('@playwright/test').Page, segmentCount: number, docId: string) {
    const content = makeSyntheticDocument(segmentCount, docId)
    await page.evaluate(
      ({ content, docId }) => {
        const store = (window as any).$store
        store.loadFromFile(content, `/test/${docId}.captions_json5`)
      },
      { content, docId }
    )
    await page.waitForFunction(
      (n) => (window as any).$store?.document?.segments?.length === n,
      segmentCount,
      { timeout: 5000 }
    )
    await page.waitForSelector('.ag-center-cols-container .ag-row', { timeout: 5000 })
    await page.waitForTimeout(500)
  }

  /**
   * Simulate a smooth scrub via requestAnimationFrame — the same code path
   * as dragging the media scrub bar, which calls store.setCurrentTime()
   * (sets both currentTime and selectedSegmentId) on each frame.
   */
  async function simulateScrub(
    page: import('@playwright/test').Page,
    fromTime: number,
    toTime: number,
    steps: number = 30
  ) {
    await page.evaluate(({ from, to, steps }) => {
      return new Promise<void>((resolve) => {
        const store = (window as any).$store
        let i = 0
        function step() {
          const t = from + (to - from) * (i / steps)
          store.setCurrentTime(t)
          i++
          if (i <= steps) {
            requestAnimationFrame(step)
          } else {
            resolve()
          }
        }
        requestAnimationFrame(step)
      })
    }, { from: fromTime, to: toTime, steps })
    await page.waitForTimeout(500)
  }

  async function getViewportScrollTop(page: import('@playwright/test').Page): Promise<number> {
    return page.evaluate(() => {
      const viewport = document.querySelector('.ag-body-viewport')
      return viewport?.scrollTop ?? -1
    })
  }

  async function scrollToTop(page: import('@playwright/test').Page) {
    await page.evaluate(() => {
      const viewport = document.querySelector('.ag-body-viewport')
      if (viewport) viewport.scrollTop = 0
    })
    await page.waitForTimeout(300)
  }

  test('grid should not jump after scrub-to-end-and-back then cell edit', async ({ page }) => {
    const SEGMENT_COUNT = 80
    const lastTime = (SEGMENT_COUNT - 1) * 3 + 1
    const firstTime = 0.5

    await loadDocument(page, SEGMENT_COUNT, 'scroll-scrub-edit')

    // Simulate scrub bar drag to the end (rapid setCurrentTime via rAF)
    await simulateScrub(page, 0, lastTime)
    expect(await getViewportScrollTop(page)).toBeGreaterThan(50)

    // Simulate scrub bar drag back to the start
    await simulateScrub(page, lastTime, firstTime)

    // Ensure we're at the top (scrub may not land exactly on row 0)
    await scrollToTop(page)
    expect(await getViewportScrollTop(page)).toBeLessThan(5)

    // Click Verified on first row — this triggers a store update that
    // replaces document.value, which recomputes rowData for AG Grid.
    await page.locator(
      '.ag-center-cols-container .ag-row[row-index="0"] [col-id="verified"]'
    ).click()
    await page.waitForTimeout(500)

    // Verified should have toggled
    expect(await page.evaluate(
      () => (window as any).$store.document.segments[0].verified
    )).toBe(true)

    // THE BUG: After scrub-to-end-and-back, editing a cell causes AG Grid
    // to scroll to a "remembered" position (~row 9-10).
    const scrollAfterEdit = await getViewportScrollTop(page)
    expect(scrollAfterEdit).toBeLessThan(50)
  })

  test('repeated edits should not keep jumping back to the same position', async ({ page }) => {
    const SEGMENT_COUNT = 80
    const lastTime = (SEGMENT_COUNT - 1) * 3 + 1
    const firstTime = 0.5

    await loadDocument(page, SEGMENT_COUNT, 'scroll-scrub-drift')

    // Scrub to end and back
    await simulateScrub(page, 0, lastTime)
    await simulateScrub(page, lastTime, firstTime)
    await scrollToTop(page)

    // Each edit should stay near the top, not jump to a remembered position
    for (let rowIdx = 0; rowIdx < 3; rowIdx++) {
      await page.locator(
        `.ag-center-cols-container .ag-row[row-index="${rowIdx}"] [col-id="verified"]`
      ).click()
      await page.waitForTimeout(300)

      const scrollTop = await getViewportScrollTop(page)
      expect(scrollTop).toBeLessThan(50)
    }
  })
})
