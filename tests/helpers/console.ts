import { Page } from '@playwright/test'

/**
 * Enable console output capture for an Electron window
 * Prints all browser console messages to the test output
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
      console.error('[Browser Error]', text)
    } else if (type === 'warning') {
      console.warn('[Browser Warning]', text)
    } else {
      console.log('[Browser]', text)
    }
  })
}
