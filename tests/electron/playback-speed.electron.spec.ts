import { sharedElectronTest as test, expect } from '../helpers/shared-electron'
import type { Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs/promises'
import { getProjectRoot } from '../helpers/project-root'
import { parseCaptionsFileContent } from '../helpers/parseCaptionsFileContent'

/**
 * The playback-speed selector next to the transport controls.
 *
 * Worth an end-to-end pass rather than only a unit test: the speed is document state, so it has
 * to reach `uiState` in a file actually written to disk, and it has to reach a real `<audio>`
 * element whose `playbackRate` a real decoder resets whenever a source loads.
 */
test.describe('Playback speed', () => {
  const speedSelect = (page: Page) => page.locator('[data-testid="playback-speed"]')
  const tmpDir = path.join(getProjectRoot(), 'test_data', 'temp-playback-speed')

  test.afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  })

  /** A real file on disk, so the document can be saved and reopened through the app's own path. */
  async function writeFixture(name: string): Promise<string> {
    await fs.mkdir(tmpDir, { recursive: true })
    const filePath = path.join(tmpDir, name)
    await fs.writeFile(filePath, JSON.stringify({
      metadata: { id: `speed-${name}` },
      segments: [{ id: 'seg-1', index: 0, startTime: 0, endTime: 5, text: 'Alpha' }]
    }, null, 2), 'utf-8')
    return filePath
  }

  /** Load a captions file the way a file drop would, then attach the audio. */
  async function loadDocument(page: Page, filePath: string) {
    await page.evaluate(async (p: string) => {
      const store = (window as any).$store
      store.reset()
      const results = await window.electronAPI!.processDroppedFiles([p])
      for (const res of results) {
        if (res.type === 'captions_json5' && res.content) store.loadFromFile(res.content, res.filePath)
      }
    }, filePath)
    await page.waitForTimeout(200)
  }

  async function loadMedia(page: Page, name = 'test-audio-10s.wav') {
    const audioPath = path.join(getProjectRoot(), 'test_data', name)
    await page.evaluate(async (p: string) => {
      const store = (window as any).$store
      const result = await window.electronAPI!.fileToURL(p)
      if (!result.success || !result.url) throw new Error('Failed to convert path to URL')
      store.loadMediaFile(result.url, p)
    }, audioPath)
    await expect(page.locator('audio')).toBeAttached()
  }

  async function loadDocumentAndMedia(page: Page, name: string): Promise<string> {
    const filePath = await writeFixture(name)
    await loadDocument(page, filePath)
    await loadMedia(page)
    return filePath
  }

  test('selecting a speed drives the media element', async ({ page }) => {
    await loadDocumentAndMedia(page, 'drive.captions_json5')

    const select = speedSelect(page)
    await expect(select).toBeEnabled()
    await expect(select).toHaveValue('1')

    await select.selectOption('1.5')

    await expect
      .poll(() => page.evaluate(() => document.querySelector('audio')!.playbackRate))
      .toBe(1.5)
  })

  test('the speed is written into uiState and restored when the file is reopened', async ({ page }) => {
    const filePath = await loadDocumentAndMedia(page, 'persist.captions_json5')

    // Attaching the media above is a real content change, so start from a clean slate to
    // isolate what picking a speed does on its own.
    await page.evaluate(() => (window as any).$store.markSaved())

    await speedSelect(page).selectOption('0.75')

    // Changing speed is *view* state — it must not make the document look edited.
    expect(await page.evaluate(() => (window as any).$store.isDirty)).toBe(false)
    expect(await page.evaluate(() => (window as any).$store.viewDirty)).toBe(true)

    await page.evaluate(async () => {
      const store = (window as any).$store
      await window.electronAPI!.saveExistingFile({
        filePath: store.document.filePath,
        content: store.exportToString()
      })
    })

    const written = parseCaptionsFileContent(await fs.readFile(filePath, 'utf-8')) as any
    expect(written.uiState.playbackRate).toBe(0.75)

    // Reopening restores it — the point of storing it per document rather than per user.
    await loadDocument(page, filePath)
    await loadMedia(page)

    await expect(speedSelect(page)).toHaveValue('0.75')
    await expect
      .poll(() => page.evaluate(() => document.querySelector('audio')!.playbackRate))
      .toBe(0.75)
  })

  test('a different document opens at its own speed, not the last one used', async ({ page }) => {
    await loadDocumentAndMedia(page, 'fast.captions_json5')
    await speedSelect(page).selectOption('1.75')

    // A per-user preference would carry 1.75x over here; per-document state must not.
    await loadDocumentAndMedia(page, 'plain.captions_json5')
    await expect(speedSelect(page)).toHaveValue('1')
  })

  test('the chosen speed survives loading a different media file', async ({ page }) => {
    await loadDocumentAndMedia(page, 'reload-media.captions_json5')
    await speedSelect(page).selectOption('0.75')

    // A fresh source resets `playbackRate` to 1 in a real decoder; `loadedmetadata` re-applies it.
    await loadMedia(page, 'OSR_us_000_0010_8k.wav')

    await expect
      .poll(() => page.evaluate(() => document.querySelector('audio')!.playbackRate))
      .toBe(0.75)
    await expect(speedSelect(page)).toHaveValue('0.75')
  })

  test('offers the full set of speeds around 1x', async ({ page }) => {
    await loadDocumentAndMedia(page, 'options.captions_json5')

    const labels = await speedSelect(page).locator('option').allTextContents()
    expect(labels.map(t => t.trim())).toEqual(
      ['0.5x', '0.75x', '0.9x', '1x', '1.1x', '1.25x', '1.5x', '1.75x', '2x']
    )
  })
})
