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
      const store = (window as any).$store
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
    () => (window as any).$store !== undefined,
    { timeout }
  )
}
