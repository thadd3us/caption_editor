/**
 * Quit coordination across windows.
 *
 * A quit has to ask every window in turn, and any one of them must be able to veto
 * the whole thing. The previous implementation broadcast the request to all windows
 * at once, so the first to answer closed itself and a later "Keep working" could not
 * bring it back.
 *
 * The close interception is normally disabled under NODE_ENV=test so that ordinary
 * E2E teardown (app.quit()) does not hang. This spec opts back in with
 * CAPTION_EDITOR_INTERCEPT_CLOSE=1 and force-destroys windows in teardown.
 */
import { test, expect, ElectronApplication, Page } from '@playwright/test'
import { launchElectron } from '../helpers/electron-launch'
import { acceptLicenseIfVisible } from '../helpers/license'

let electronApp: ElectronApplication

async function newWindow(): Promise<Page> {
  const before = electronApp.windows().length
  await electronApp.evaluate(async ({ Menu }) => {
    const menu = Menu.getApplicationMenu()
    const fileMenu = menu?.items.find((i: Electron.MenuItem) => i.label === 'File')
    const item = fileMenu?.submenu?.items.find((i: Electron.MenuItem) => i.label === 'New Window')
    if (item?.click) item.click(item, undefined as any, undefined as any)
  })
  await expect.poll(() => electronApp.windows().length, { timeout: 10000 }).toBe(before + 1)
  const page = electronApp.windows()[before]
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => (window as any).$store, { timeout: 10000 })
  await acceptLicenseIfVisible(page)
  return page
}

/** Ask the app to quit, exactly as Cmd+Q does. */
async function requestQuit(): Promise<void> {
  await electronApp.evaluate(async ({ app }) => {
    app.quit()
  })
}

test.beforeAll(async () => {
  electronApp = await launchElectron({ env: { CAPTION_EDITOR_INTERCEPT_CLOSE: '1' } })
  const page = await electronApp.firstWindow()
  await page.waitForFunction(() => (window as any).$store, { timeout: 10000 })
  await acceptLicenseIfVisible(page)
})

test.afterAll(async () => {
  // `app.exit()` skips `before-quit`, so the interception this spec deliberately
  // enabled cannot hang teardown the way `app.quit()` would.
  await electronApp
    ?.evaluate(async ({ app, BrowserWindow }) => {
      for (const win of BrowserWindow.getAllWindows()) win.destroy()
      app.exit(0)
    })
    .catch(() => {})
  await electronApp?.close().catch(() => {})
})

/** Wait for whichever window is currently showing the unsaved-changes dialog. */
async function pageShowingQuitDialog(timeoutMs = 10000): Promise<Page> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    for (const page of electronApp.windows()) {
      if (page.isClosed()) continue
      const visible = await page
        .locator('.base-modal', { hasText: 'Unsaved Changes' })
        .isVisible()
        .catch(() => false)
      if (visible) return page
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error('No window showed the unsaved-changes dialog')
}

test('"Keep working" in one window cancels the quit for every window', async () => {
  const page1 = electronApp.windows()[0]
  const page2 = await newWindow()

  // Both windows have unsaved content, so both will be asked.
  for (const page of [page1, page2]) {
    await page.evaluate(() => (window as any).$store.addSegment(0, 5))
  }

  await requestQuit()

  // Windows are asked one at a time; veto in whichever one is asked first.
  const asked = await pageShowingQuitDialog()
  await asked.locator('.base-modal button:has-text("Keep working")').click()

  // Nothing closed, and the second window never lost its edits.
  await page1.waitForTimeout(1000)
  expect(electronApp.windows().length).toBe(2)
  expect(await page2.evaluate(() => (window as any).$store.document.segments.length)).toBe(1)
  expect(await page1.evaluate(() => (window as any).$store.document.segments.length)).toBe(1)
})

test('discarding in every window completes the quit', async () => {
  expect(electronApp.windows().length).toBe(2)

  await requestQuit()

  // Windows are asked one at a time, so keep answering whichever dialog is up
  // until every window has gone away.
  const deadline = Date.now() + 20000
  while (electronApp.windows().length > 0 && Date.now() < deadline) {
    let clicked = false
    for (const page of electronApp.windows()) {
      if (page.isClosed()) continue
      const button = page.locator('.base-modal button:has-text("Discard and Quit")')
      if (await button.isVisible().catch(() => false)) {
        await button.click().catch(() => {})
        clicked = true
        break
      }
    }
    await new Promise((resolve) => setTimeout(resolve, clicked ? 300 : 200))
  }

  expect(electronApp.windows().length).toBe(0)
})
