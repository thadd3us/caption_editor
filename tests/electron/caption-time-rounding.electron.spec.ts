import { sharedElectronTest as test, expect } from '../helpers/shared-electron'
import { ElectronApplication, Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs/promises'
import { execSync } from 'child_process'
import { getProjectRoot } from '../helpers/project-root'

test.describe('Caption time rounding', () => {
  const tempDir = path.join(getProjectRoot(), 'test_data', 'temp-caption-rounding')

  async function writeTestCaptionsFile(fileName: string, doc: any): Promise<string> {
    await fs.mkdir(tempDir, { recursive: true })
    const filePath = path.join(tempDir, fileName)
    await fs.writeFile(filePath, JSON.stringify(doc, null, 2), 'utf-8')
    return filePath
  }

  async function loadCaptionsFile(electronApp: ElectronApplication, page: Page, filePath: string) {
    await electronApp.evaluate(async ({ webContents }, p) => {
      const windows = webContents.getAllWebContents()
      if (windows.length > 0) {
        windows[0].send('open-file', p)
      }
    }, filePath)

    await page.waitForFunction(
      () => {
        const store = (window as any).$store
        return store && store.document && store.document.segments && store.document.segments.length > 0
      },
      { timeout: 5000 }
    )
  }

  async function loadMediaFile(page: Page, filePath: string) {
    const url = await page.evaluate(async (p) => {
      const store = (window as any).$store
      const electronAPI = (window as any).electronAPI
      if (!store?.loadMediaFile) throw new Error('Store not available')
      if (!electronAPI?.fileToURL) throw new Error('electronAPI.fileToURL not available')

      const urlResult = await electronAPI.fileToURL(p)
      if (!urlResult.success || !urlResult.url) throw new Error('Failed to convert file path to URL')
      store.loadMediaFile(urlResult.url, p)
      return urlResult.url as string
    }, filePath)
    await page.waitForFunction(
      (expectedUrl) => {
        const store = (window as any).$store
        return store && store.mediaPath === expectedUrl
      },
      url,
      { timeout: 5000 }
    )
  }

  test.afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
  })

  test('clicking a caption whose startTime has floating-point imprecision should still show that caption', async ({ electronApp, page }) => {
    // Generate a 95-second silent WAV (enough to cover the segment at ~90s)
    await fs.mkdir(tempDir, { recursive: true })
    const silencePath = path.join(tempDir, 'silence.wav')
    execSync(
      `ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=mono -t 95 -q:a 9 "${silencePath}"`,
      { stdio: 'pipe' }
    )

    // Write a captions file with the exact problematic startTime from the real file
    const captionsPath = await writeTestCaptionsFile('rounding-test.captions_json', {
      metadata: { id: 'rounding-test' },
      segments: [{
        id: 'mordor-seg',
        startTime: 90.03999999999999,
        endTime: 92.68,
        text: 'One does not simply walk into Mordor.'
      }]
    })

    // Load captions and media
    await loadCaptionsFile(electronApp, page, captionsPath)
    await loadMediaFile(page, silencePath)

    // Click the caption row in the AG Grid table
    const row = page.locator('.ag-row .ag-cell', { hasText: 'One does not simply walk into Mordor.' })
    await expect(row).toBeVisible({ timeout: 5000 })
    await row.click()

    // Wait for the media element's timeupdate to fire back into the store.
    // The click sets store.currentTime to the exact startTime (90.03999999999999),
    // then the media element seeks and fires timeupdate with its own (rounded) value.
    // We wait for currentTime to differ from the exact startTime we set.
    const startTime = 90.03999999999999
    await page.waitForFunction(
      (st) => {
        const store = (window as any).$store
        return store && store.currentTime >= 89 && store.currentTime !== st
      },
      startTime,
      { timeout: 5000 }
    )

    // The caption display should show the segment text, not be empty
    const captionDisplay = page.locator('.caption-text')
    await expect(captionDisplay).not.toHaveText('', { timeout: 3000 })
  })
})
