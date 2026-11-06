import { Page } from '@playwright/test'

import { testProcessLogger } from './test-logger'

/**
 * Enable console output capture for an Electron window
 * Forwards renderer `console` to {@link testProcessLogger} (Winston on the Node test process).
 *
 * @param page - The Playwright Page object
 * @example
 * ```ts
 * const page = await firstReadyWindow(electronApp)
 * enableConsoleCapture(page)
 * ```
 */
export function enableConsoleCapture(page: Page): void {
  page.on('console', msg => {
    const type = msg.type()
    const text = msg.text()
    if (type === 'error') {
      testProcessLogger.error(`[Browser Error] ${text}`)
    } else if (type === 'warning') {
      testProcessLogger.warn(`[Browser Warning] ${text}`)
    } else {
      testProcessLogger.info(`[Browser] ${text}`)
    }
  })
}
