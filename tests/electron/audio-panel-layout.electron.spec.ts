import { sharedElectronTest as test, expect } from '../helpers/shared-electron'
import type { Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs/promises'
import { getProjectRoot } from '../helpers/project-root'

/**
 * How the right-hand panel divides its height between the media box and the caption box.
 *
 * This needs a real browser engine: it is a flexbox outcome, and happy-dom does no layout, so
 * the unit tests in `MediaPlayer.audioLayout.test.ts` can only assert the class and the absence
 * of the inline height. The bug they cannot see is the one that mattered — `.video-container`
 * is `flex: 1`, so for an audio file a ~54px `<audio>` element sat in the middle of a ~596px
 * black box (at a 900px-tall window) while the caption panel underneath, the thing you actually
 * read and edit in, got the 120px `captionHeight` default.
 *
 * So these assert measured geometry, and deliberately not exact pixels: the numbers depend on
 * window size and platform chrome. What must hold is the relationship.
 */
test.describe('Media panel height split', () => {
  const tmpDir = path.join(getProjectRoot(), 'test_data', 'temp-audio-panel-layout')

  test.afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  })

  /** Attach a real audio file through the app's own `media://` path. */
  async function loadAudio(page: Page, mediaFile: string) {
    const mediaPath = path.join(getProjectRoot(), 'test_data', mediaFile)
    await page.evaluate(async (p: string) => {
      const store = (window as { $store?: any }).$store
      store.reset()
      const url = await window.electronAPI!.fileToURL(p)
      store.loadMediaFile(url.url, p)
    }, mediaPath)
    await page.waitForFunction(() => !!(window as { $store?: any }).$store.mediaPath)
  }

  /**
   * Attach a video path without a file behind it. The repo ships no video fixture, and this
   * test does not need one: the branch is chosen from the extension in `store.mediaPath`, and
   * flexbox lays the `<video>` element out whether or not a decoder ever gets a frame.
   */
  async function loadVideoPath(page: Page) {
    await page.evaluate(() => {
      const store = (window as { $store?: any }).$store
      store.reset()
      store.loadMediaFile('media://local/nonexistent/clip.mp4', '/nonexistent/clip.mp4')
    })
    await page.waitForFunction(() => !!(window as { $store?: any }).$store.mediaPath)
  }

  /** Heights of the two boxes that share the panel, plus the panel itself. */
  async function heights(page: Page) {
    return page.evaluate(() => {
      const h = (sel: string) => {
        const el = document.querySelector(sel)
        return el ? Math.round(el.getBoundingClientRect().height) : null
      }
      return {
        panel: h('.media-player'),
        mediaBox: h('.video-container'),
        captionBox: h('.current-caption-display'),
        mediaEl: h('audio') ?? h('video'),
        audioOnly: !!document.querySelector('.media-player.audio-only'),
      }
    })
  }

  test('audio gives the caption box the height the media box does not need', async ({ page }) => {
    await loadAudio(page, 'test-audio-10s.wav')
    await expect.poll(async () => (await heights(page)).audioOnly).toBe(true)

    const h = await heights(page)
    expect(h.mediaEl).not.toBeNull()
    expect(h.panel).not.toBeNull()

    // The media box wraps the audio widget instead of claiming the panel. Allow generous
    // slack for padding and the filename row; the old behaviour was ~11x the element.
    expect(h.mediaBox!).toBeLessThan(h.mediaEl! * 3)

    // And the reclaimed height lands in the caption box, which is the whole point.
    expect(h.captionBox!).toBeGreaterThan(h.mediaBox!)
    expect(h.captionBox!).toBeGreaterThan(h.panel! * 0.4)
  })

  test('video still gets the panel, and the caption box keeps captionHeight', async ({ page }) => {
    await loadVideoPath(page)
    await page.evaluate(() => { (window as { $store?: any }).$store.captionHeight = 160 })
    await expect.poll(async () => (await heights(page)).audioOnly).toBe(false)

    const h = await heights(page)
    // Video is the case `flex: 1` was written for: the frame takes what is going.
    expect(h.mediaBox!).toBeGreaterThan(h.captionBox!)
    expect(h.captionBox).toBe(160)
  })
})
