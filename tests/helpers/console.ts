import { Page } from '@playwright/test'

import { testProcessLogger } from './test-logger'

/**
 * Enable console output capture for an Electron window
 * Forwards renderer `console` to {@link testProcessLogger} (Winston on the Node test process).
 *
 * @param window - The Playwright Page object
 * @example
 * ```ts
 * const window = await electronApp.firstWindow()
 * enableConsoleCapture(window)
 * ```
 */
export function enableConsoleCapture(window: Page): void {
  window.on('console', msg => {
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
