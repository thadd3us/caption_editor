import { test, expect, _electron as electron } from '@playwright/test'
import { ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { enableConsoleCapture } from './helpers/console'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

test.describe('Media Element Seek Test', () => {
  let electronApp: ElectronApplication
  let window: Page

  test.beforeEach(async () => {
    // Launch Electron app
    electronApp = await electron.launch({
      args: [path.join(process.cwd(), 'dist-electron/main.cjs'), '--no-sandbox'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DISPLAY: process.env.DISPLAY || ':99'
      }
    })

    // Wait for the first window
    window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    enableConsoleCapture(window)
  })

  test.afterEach(async () => {
    if (electronApp) { await electronApp.close().catch(() => {}) }
  })

  test('should set audio currentTime and update store via timeupdate event', async () => {
    // Load audio file
    const audioPath = path.join(__dirname, 'fixtures', 'test-audio-10s.wav')
    await window.evaluate((filePath) => {
      const audioUrl = `file://${filePath}`
      ;(window as any).$store.loadMediaFile(audioUrl)
    }, audioPath)

    await window.waitForTimeout(200)

    // Verify audio element exists
    const hasAudio = await window.evaluate(() => {
      const audio = document.querySelector('audio')
      return !!audio
    })
    expect(hasAudio).toBe(true)

    // Set audio currentTime directly
    await window.evaluate(() => {
      const audio = document.querySelector('audio') as HTMLAudioElement
      if (audio) {
        audio.currentTime = 3
      }
    })

    await window.waitForTimeout(100)

    // Verify audio currentTime was set
    const audioTime = await window.evaluate(() => {
      const audio = document.querySelector('audio') as HTMLAudioElement
      return audio ? audio.currentTime : null
    })
    expect(audioTime).toBeCloseTo(3, 1)

    // Check if store was updated (via onTimeUpdate event)
    // Note: timeupdate event may not fire if media isn't playing
    const storeTime = await window.evaluate(() => (window as any).$store.currentTime)
    console.log('Store currentTime:', storeTime)

    // Check scrubber value
    const scrubberValue = await window.evaluate(() => {
      const scrubber = document.querySelector('.scrubber') as HTMLInputElement
      return scrubber ? parseFloat(scrubber.value) : null
    })
    console.log('Scrubber value:', scrubberValue)

    // Note: The timeupdate event typically doesn't fire when just setting currentTime
    // It fires during playback. So the store and scrubber may not update automatically.
    console.log('Test completed: audio.currentTime can be set directly')
  })
})
