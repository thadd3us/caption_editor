import { expect, Page } from '@playwright/test'

/**
 * Matches the total segment count in the caption table status line (`.grid-stats`),
 * e.g. "4 captions / 4 visible / 0 selected".
 */
export function gridStatsTotalRegex(total: number): RegExp {
  const label = total === 1 ? 'caption' : 'captions'
  return new RegExp(`\\b${total} ${label}\\b`)
}

export async function expectGridCaptionTotal(page: Page, total: number, timeout = 5000): Promise<void> {
  await expect(page.locator('.grid-stats')).toContainText(gridStatsTotalRegex(total), { timeout })
}

/**
 * Wait for the VTT store to have a specific number of segments
 */
export async function waitForSegmentCount(page: Page, count: number, timeout = 5000): Promise<void> {
  await page.waitForFunction(
    (expectedCount) => {
      const store = window.$store
      return store?.document?.segments?.length === expectedCount
    },
    count,
    { timeout }
  )
}

/**
 * Wait for a modal/dialog to be visible or hidden
 */
export async function waitForModalVisible(page: Page, visible: boolean, timeout = 5000): Promise<void> {
  if (visible) {
    await page.waitForSelector('.base-modal-overlay', { state: 'visible', timeout })
  } else {
    await page.waitForSelector('.base-modal-overlay', { state: 'hidden', timeout })
  }
}

/**
 * Wait for the store to be ready
 */
export async function waitForStore(page: Page, timeout = 5000): Promise<void> {
  await page.waitForFunction(
    () => window.$store !== undefined,
    { timeout }
  )
}

/* ---------------------------------------------------------------------------
 * Waiting on state instead of on the clock.
 *
 * These exist to replace `page.waitForTimeout(...)`. A fixed sleep is wrong in both
 * directions: it is dead time when the app is ready sooner, and it is a flake when the
 * machine is slower than whoever picked the number — and nothing tells you which, because
 * a sleep that is too short fails somewhere later with a confusing error.
 * ------------------------------------------------------------------------- */

/**
 * Poll a function evaluated in the page until it equals `expected`.
 *
 * `read` is serialized and run in the renderer, so it closes over nothing from the spec —
 * reach for `window.$store` inside it. On timeout the failure reports the last value seen,
 * which is the diagnostic a sleep never gives you.
 */
export async function expectPageValue<T>(
  page: Page,
  read: () => T,
  expected: T,
  timeout = 5000
): Promise<void> {
  await expect.poll(async () => page.evaluate(read), { timeout }).toEqual(expected)
}

/** Wait until exactly `count` grid rows report themselves selected. */
export async function waitForSelectedRowCount(page: Page, count: number, timeout = 5000): Promise<void> {
  await page.waitForFunction(
    (expected) => document.querySelectorAll('.ag-center-cols-container .ag-row-selected').length === expected,
    count,
    { timeout }
  )
}

/**
 * Wait until AG Grid has an edit session open on `colId` and its input holds the focus.
 *
 * `gridApi.startEditingCell()` returns before the editor component has mounted and taken
 * focus, which is what the 100–200ms sleeps around editing were standing in for.
 */
export async function waitForCellEditorFocused(page: Page, selector: string, timeout = 5000): Promise<void> {
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel)
      return !!el && document.activeElement === el
    },
    selector,
    { timeout }
  )
}
