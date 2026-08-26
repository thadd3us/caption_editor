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
  async function writeFixture(name: string, segments?: unknown[]): Promise<string> {
    await fs.mkdir(tmpDir, { recursive: true })
    const filePath = path.join(tmpDir, name)
    await fs.writeFile(filePath, JSON.stringify({
      metadata: { id: `speed-${name}` },
      segments: segments ?? [{ id: 'seg-1', index: 0, startTime: 0, endTime: 5, text: 'Alpha' }]
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

  async function loadDocumentAndMedia(page: Page, name: string, audio?: string): Promise<string> {
    const filePath = await writeFixture(name)
    await loadDocument(page, filePath)
    await loadMedia(page, audio)
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

  /**
   * The one assertion that actually proves the feature works.
   *
   * Every other test here checks that we *told* the media element a rate — `playbackRate` is a
   * plain property, and setting it would still "pass" if the decoder ignored it entirely. This
   * one plays real audio and compares elapsed wall-clock time against elapsed media time, so it
   * fails if the audio does not genuinely run faster or slower.
   *
   * Measurement starts only after the playhead is already moving: `play()` resolves before the
   * decoder is up to speed, and counting that startup latency drags the observed ratio well
   * below the true rate.
   */
  test('really decodes faster and slower, not just sets a property', async ({ page }) => {
    test.setTimeout(60000)
    await loadDocumentAndMedia(page, 'decode.captions_json5', 'OSR_us_000_0010_8k.wav')

    for (const rate of [0.5, 1, 2]) {
      await speedSelect(page).selectOption(String(rate))

      const observed = await page.evaluate(async () => {
        const el = document.querySelector('audio') as HTMLAudioElement
        el.pause()
        el.currentTime = 0
        await el.play()

        // Wait for the decoder to actually be rolling before starting the clock.
        const startedBy = performance.now() + 3000
        while (el.currentTime < 0.2 && performance.now() < startedBy) {
          await new Promise(r => setTimeout(r, 20))
        }

        const wall0 = performance.now()
        const media0 = el.currentTime
        await new Promise(r => setTimeout(r, 1200))
        const ratio = (el.currentTime - media0) / ((performance.now() - wall0) / 1000)
        el.pause()
        return ratio
      })

      // Wide band: this is a timing measurement on a shared machine, and the point is to catch
      // "the rate never reached the decoder", not to audit the decoder's precision.
      expect(observed, `media time should advance ~${rate}x per wall-clock second`)
        .toBeGreaterThan(rate * 0.75)
      expect(observed).toBeLessThan(rate * 1.25)
    }
  })

  /**
   * Sequential ("Play Segments") playback advances on `timeupdate`, which fires on a wall-clock
   * cadence — so at 2x each event covers twice as much media time. A segment shorter than that
   * step would be stepped over, leaving the table's highlight out of sync with the audio.
   *
   * With ordinary caption-length segments there is plenty of margin, and this pins that: every
   * segment is still visited in order, and the amount by which the audio runs past a segment's
   * end before the playlist catches up stays a fraction of the segment.
   */
  test('sequential segment playback still visits every segment at 2x', async ({ page }) => {
    test.setTimeout(60000)
    const segments = Array.from({ length: 6 }, (_, i) => ({
      id: `seg${i}`, index: i, startTime: i, endTime: i + 1, text: `Line ${i}`
    }))
    await writeFixture('playlist.captions_json5', segments)
    await loadDocument(page, path.join(tmpDir, 'playlist.captions_json5'))
    await loadMedia(page, 'OSR_us_000_0010_8k.wav')

    await speedSelect(page).selectOption('2')

    const run = await page.evaluate(async () => {
      const store = (window as any).$store
      const el = document.querySelector('audio') as HTMLAudioElement
      el.currentTime = 0
      store.startPlaylistPlayback(store.document.segments.map((s: any) => s.id), 0)

      const visited: string[] = []
      const overshoots: number[] = []
      for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 50))
        const seg = store.currentPlaylistSegment
        if (seg?.id && visited[visited.length - 1] !== seg.id) visited.push(seg.id)
        if (seg && store.isPlaying) overshoots.push(el.currentTime - seg.endTime)
        if (!store.isPlaying && i > 4) break
      }
      el.pause()
      return { visited, maxOvershoot: overshoots.length ? Math.max(...overshoots) : 0 }
    })

    expect(run.visited).toEqual(['seg0', 'seg1', 'seg2', 'seg3', 'seg4', 'seg5'])
    // Doubling the rate doubles the overshoot; 1s segments still leave ample margin.
    expect(run.maxOvershoot).toBeLessThan(0.6)
  })

  test('adopts a speed set from the native controls overlay', async ({ page }) => {
    const filePath = await loadDocumentAndMedia(page, 'native.captions_json5')
    await page.evaluate(() => (window as any).$store.markSaved())

    // Chromium's `controls` overlay has its own speed submenu, which writes the property
    // directly. The app must notice, or the audio runs at a speed the UI does not show and the
    // document never records.
    await page.evaluate(() => {
      (document.querySelector('audio') as HTMLAudioElement).playbackRate = 1.5
    })

    await expect(speedSelect(page)).toHaveValue('1.5')
    expect(await page.evaluate(() => (window as any).$store.playbackRate)).toBe(1.5)

    // And it is document state like any other speed change: saved, but not a content edit.
    expect(await page.evaluate(() => (window as any).$store.isDirty)).toBe(false)
    await page.evaluate(async () => {
      const store = (window as any).$store
      await window.electronAPI!.saveExistingFile({
        filePath: store.document.filePath,
        content: store.exportToString()
      })
    })
    const written = parseCaptionsFileContent(await fs.readFile(filePath, 'utf-8')) as any
    expect(written.uiState.playbackRate).toBe(1.5)
  })

  test('offers the full set of speeds around 1x', async ({ page }) => {
    await loadDocumentAndMedia(page, 'options.captions_json5')

    const labels = await speedSelect(page).locator('option').allTextContents()
    expect(labels.map(t => t.trim())).toEqual(
      ['0.25x', '0.5x', '0.75x', '0.9x', '1x', '1.1x', '1.25x', '1.5x', '1.75x', '2x']
    )
  })
})
