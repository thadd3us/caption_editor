import { test, expect, ElectronApplication } from '@playwright/test'
import { launchElectron } from '../helpers/electron-launch'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs/promises'
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
    store.loadFromFile(content, '/tmp/test.captions_json5')
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

test('a transcript already open in another window focuses that window instead of loading', async () => {
  // Two windows may show the same *media* (served read-only), but editing one
  // transcript in two windows means two independent in-memory copies and a
  // last-writer-wins save.
  const windows = electronApp.windows()
  expect(windows.length).toBeGreaterThanOrEqual(2)
  const [page1, page2] = windows

  const captionsPath = path.join(os.tmpdir(), 'caption-editor-shared-doc.captions_json5')
  await fs.writeFile(
    captionsPath,
    JSON.stringify({
      metadata: { id: 'shared-doc' },
      segments: [{ id: 'seg-1', index: 0, startTime: 0, endTime: 1, text: 'Only copy' }]
    }),
    'utf-8'
  )

  // Window 1 opens (and therefore claims) the document.
  await page1.evaluate(async (p) => {
    await (window as any).handleExternalFileOpen([p])
  }, captionsPath)
  await expect
    .poll(() => page1.evaluate(() => (window as any).$store.document.filePath), { timeout: 5000 })
    .toBe(captionsPath)

  // Window 2 tries the same file and is refused.
  const claim = await page2.evaluate(
    async (p) => await window.electronAPI!.claimDocument!(p),
    captionsPath
  )
  expect(claim.claimed).toBe(false)
  expect(claim.focusedExistingWindow).toBe(true)

  // Window 2's own document is untouched.
  await page2.evaluate(async (p) => {
    await (window as any).handleExternalFileOpen([p])
  }, captionsPath)
  const w2Path = await page2.evaluate(() => (window as any).$store.document.filePath)
  expect(w2Path).not.toBe(captionsPath)
})

test('the same media file may be open in two windows', async () => {
  const windows = electronApp.windows()
  const [page1, page2] = windows
  const mediaPath = '/media/shared-recording.wav'

  for (const page of [page1, page2]) {
    await page.evaluate((p) => {
      ;(window as any).$store.loadMediaFile(`media://${p}`, p)
    }, mediaPath)
  }

  for (const page of [page1, page2]) {
    expect(await page.evaluate(() => (window as any).$store.mediaFilePath)).toBe(mediaPath)
  }
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
