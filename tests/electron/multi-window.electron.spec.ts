import { test, expect, ElectronApplication } from '@playwright/test'
import { launchElectron } from '../helpers/electron-launch'
import { acceptLicenseIfVisible } from '../helpers/license'

let electronApp: ElectronApplication

test.beforeAll(async () => {
  electronApp = await launchElectron()
  const page = await electronApp.firstWindow()
  await acceptLicenseIfVisible(page)
})

test.afterAll(async () => {
  await electronApp?.close()
})

test('Cmd+N creates a second window', async () => {
  const windows = electronApp.windows()
  expect(windows.length).toBe(1)

  // Trigger New Window via menu
  await electronApp.evaluate(async ({ Menu }) => {
    const menu = Menu.getApplicationMenu()
    const fileMenu = menu?.items.find((i: Electron.MenuItem) => i.label === 'File')
    const newWindowItem = fileMenu?.submenu?.items.find((i: Electron.MenuItem) => i.label === 'New Window')
    if (newWindowItem?.click) newWindowItem.click(newWindowItem, undefined as any, undefined as any)
  })

  // Wait for the second window to appear
  await expect.poll(() => electronApp.windows().length, { timeout: 5000 }).toBe(2)
})

test('each window has independent document state', async () => {
  const windows = electronApp.windows()
  expect(windows.length).toBe(2)

  const page1 = windows[0]
  const page2 = windows[1]

  // Wait for both windows to be loaded
  await page2.waitForLoadState('domcontentloaded')
  await acceptLicenseIfVisible(page2)

  // Load a document in window 1
  const testDoc = JSON.stringify({
    metadata: { id: 'test-uuid-1' },
    title: 'Window 1 Doc',
    segments: [
      { id: 'seg-1', index: 0, startTime: 0, endTime: 1, text: 'Hello from window 1' }
    ]
  })

  await page1.evaluate((content) => {
    const store = (window as any).$store
    store.loadFromFile(content, '/tmp/test.captions_json')
  }, testDoc)

  // Verify window 1 has the document
  const w1SegCount = await page1.evaluate(() => {
    return (window as any).$store.document.segments.length
  })
  expect(w1SegCount).toBe(1)

  // Verify window 2 still has empty document
  const w2SegCount = await page2.evaluate(() => {
    return (window as any).$store.document.segments.length
  })
  expect(w2SegCount).toBe(0)
})

test('closing one window does not affect the other', async () => {
  // Ensure we have at least 2 windows (create one if needed)
  if (electronApp.windows().length < 2) {
    await electronApp.evaluate(async ({ Menu }) => {
      const menu = Menu.getApplicationMenu()
      const fileMenu = menu?.items.find((i: Electron.MenuItem) => i.label === 'File')
      const newWindowItem = fileMenu?.submenu?.items.find((i: Electron.MenuItem) => i.label === 'New Window')
      if (newWindowItem?.click) newWindowItem.click(newWindowItem, undefined as any, undefined as any)
    })
    await expect.poll(() => electronApp.windows().length, { timeout: 5000 }).toBeGreaterThanOrEqual(2)
  }

  const countBefore = electronApp.windows().length

  // Close the newest window
  await electronApp.evaluate(async ({ BrowserWindow }) => {
    const wins = BrowserWindow.getAllWindows()
    if (wins.length > 1) {
      wins[wins.length - 1].close()
    }
  })

  await expect.poll(() => electronApp.windows().length, { timeout: 5000 }).toBe(countBefore - 1)

  // First window still works
  const page1 = electronApp.windows()[0]
  const segCount = await page1.evaluate(() => {
    return (window as any).$store.document.segments.length
  })
  expect(typeof segCount).toBe('number')
})
