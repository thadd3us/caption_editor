import { ElectronApplication, Page } from '@playwright/test'

/**
 * Wait until the renderer is actually the app, not the document it navigated away from.
 *
 * `electronApp.firstWindow()` resolves as soon as a window exists. `createWindow()` then
 * calls `loadURL`/`loadFile`, and that navigation destroys the execution context the
 * returned `Page` was holding — so a later `page.evaluate()` fails with
 *
 *     Execution context was destroyed, most likely because of a navigation
 *
 * even though the window on screen is perfectly healthy. `waitForLoadState('domcontentloaded')`
 * does not protect against this: the pre-navigation document satisfies it immediately.
 *
 * Whether you lose that race is timing, and the timing changed under Electron 45: on 42
 * `firstWindow()` happened to resolve after the navigation, on 45 it resolves before, and
 * every spec that hand-rolled `firstWindow()` + `waitForLoadState` started failing in
 * `beforeEach`. The specs built on `sharedElectronTest` were unaffected because that
 * fixture already waits on `window.$store` — which is this function, and the reason it is
 * now shared rather than copied.
 *
 * `waitForFunction` is the fix because Playwright re-evaluates it after a navigation
 * instead of failing, so it settles on whichever document ends up being the app.
 * `$store` is set at the end of `src/main.ts`, after mount, so it is a true readiness
 * signal and not merely "some document exists".
 */
export async function waitForAppReady(page: Page, timeout = 30000): Promise<Page> {
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => !!(window as { $store?: unknown }).$store, null, { timeout })
  return page
}

/** `firstWindow()` followed by {@link waitForAppReady}. */
export async function firstReadyWindow(
  electronApp: ElectronApplication,
  timeout = 30000
): Promise<Page> {
  const page = await electronApp.firstWindow({ timeout })
  return waitForAppReady(page, timeout)
}
