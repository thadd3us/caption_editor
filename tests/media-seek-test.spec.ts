import { sharedElectronTest as test, expect } from './helpers/shared-electron'
import type { Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

test.describe('Media Element Seek Test', () => {
  let appPage: Page

  test.beforeEach(async ({ page }) => {
    appPage = page
  })

  test('should set audio currentTime and update store + scrubber via timeupdate event', async () => {
    // Load a tiny captions doc so MediaPlayer has something to render.
    await appPage.evaluate(() => {
      const store = window.$store
      store.loadFromFile(JSON.stringify({
        metadata: { id: 'seek-doc' },
        segments: [
          { id: 'seg1', startTime: 2.9, endTime: 3.2, text: 'At three seconds' }
        ]
      }), '/test/seek-doc.captions_json5')
    })

    await appPage.waitForFunction(() => {
      const store = window.$store
      return store?.document?.segments?.length === 1
    })

    // Load audio file
    const audioPath = path.join(__dirname, '..', 'test_data', 'test-audio-10s.wav')
    await appPage.evaluate(async (filePath) => {
      const store = window.$store
      const electronAPI = window.electronAPI
      if (!electronAPI?.fileToURL) throw new Error('electronAPI.fileToURL not available')
      const res = await electronAPI.fileToURL(filePath)
      if (!res?.success || !res.url) throw new Error('Failed to convert filePath to media:// URL')
      store.loadMediaFile(res.url, filePath)
    }, audioPath)

    // Wait for audio element to exist
    await appPage.waitForSelector('audio', { timeout: 5000 })

    // Verify audio element exists
    const hasAudio = await appPage.evaluate(() => {
      const audio = document.querySelector('audio')
      return !!audio
    })
    expect(hasAudio).toBe(true)

    // Set audio currentTime directly, and dispatch a timeupdate so MediaPlayer updates the store/scrubber.
    await appPage.evaluate(() => {
      const audio = document.querySelector('audio') as HTMLAudioElement
      if (audio) {
        audio.currentTime = 3
        audio.dispatchEvent(new Event('timeupdate'))
      }
    })

    // Wait for time to be set on the element
    await appPage.waitForFunction(() => {
      const audio = document.querySelector('audio') as HTMLAudioElement
      return audio && Math.abs(audio.currentTime - 3) < 0.5
    })

    // Verify audio currentTime was set
    const audioTime = await appPage.evaluate(() => {
      const audio = document.querySelector('audio') as HTMLAudioElement
      return audio ? audio.currentTime : null
    })
    expect(audioTime).toBeCloseTo(3, 1)

    // Store should have been updated by the timeupdate handler.
    await appPage.waitForFunction(() => {
      const t = window.$store?.currentTime
      return typeof t === 'number' && Math.abs(t - 3) < 0.5
    })

    // Scrubber should reflect currentTime.
    const scrubber = appPage.locator('.scrubber')
    await expect(scrubber).toHaveValue(/3(\.\d+)?/)

    // Caption display should also react.
    await expect(appPage.locator('.caption-text')).toContainText('At three seconds')
  })
})
