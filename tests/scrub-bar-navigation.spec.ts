import { test, expect } from './helpers/coverage'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

test.describe('Scrub Bar Navigation with Jump Buttons', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.reload()
  })

  test('should move scrub bar correctly when clicking +60 and -60 buttons', async ({ page }) => {
    test.setTimeout(15000) // Set test timeout to 15 seconds

    // Load the test WAV file via HTTP (served by vite dev server)
    const audioUrl = '/test_data/OSR_us_000_0010_8k.wav'
    const expectedFilePath = '/home/user/audio/OSR_us_000_0010_8k.wav'

    await page.evaluate(({ url, filePath }) => {
      ;(window as any).$store.loadMediaFile(url, filePath)
    }, { url: audioUrl, filePath: expectedFilePath })

    // Wait for media to load
    await page.waitForTimeout(200)

    // Verify audio element exists and is loaded
    const hasAudio = await page.evaluate(() => {
      const audio = document.querySelector('audio')
      return !!audio
    })
    expect(hasAudio).toBe(true)

    // Verify the full file path is displayed correctly in the UI
    const displayedFilePath = await page.locator('.media-filename').textContent()
    console.log('Displayed file path:', displayedFilePath)
    expect(displayedFilePath).toContain(expectedFilePath)

    // Verify the file path is stored in the store
    const storedFilePath = await page.evaluate(() => (window as any).$store.mediaFilePath)
    console.log('Stored file path:', storedFilePath)
    expect(storedFilePath).toBe(expectedFilePath)

    // Wait for audio duration to be available (not NaN)
    let duration = 0
    for (let i = 0; i < 10; i++) {
      duration = await page.evaluate(() => {
        const audio = document.querySelector('audio') as HTMLAudioElement
        return audio ? audio.duration : 0
      })
      if (!isNaN(duration) && duration > 0) {
        break
      }
      await page.waitForTimeout(100)
    }
    console.log('Audio duration:', duration)
    expect(duration).toBeGreaterThan(0)

    // Verify initial state (should be at 0)
    let currentTime = await page.evaluate(() => (window as any).$store.currentTime)
    expect(currentTime).toBeCloseTo(0, 1)

    // Verify scrubber initial value
    let scrubberValue = await page.evaluate(() => {
      const scrubber = document.querySelector('.scrubber') as HTMLInputElement
      return scrubber ? parseFloat(scrubber.value) : null
    })
    console.log('Initial scrubber value:', scrubberValue)
    expect(scrubberValue).toBeCloseTo(0, 1)

    // Click the +60 button
    const plus60Button = page.locator('button.jump-btn:has-text("+60s")')
    await plus60Button.click()
    await page.waitForTimeout(100)

    // Verify current time after +60 click
    currentTime = await page.evaluate(() => (window as any).$store.currentTime)
    console.log('Current time after +60:', currentTime)

    // Check if we're near the end of the file
    const expectedTime = Math.min(60, duration)
    expect(currentTime).toBeCloseTo(expectedTime, 1)

    // Verify audio element's currentTime matches
    const audioTime = await page.evaluate(() => {
      const audio = document.querySelector('audio') as HTMLAudioElement
      return audio ? audio.currentTime : null
    })
    console.log('Audio element currentTime:', audioTime)
    expect(audioTime).toBeCloseTo(expectedTime, 1)

    // Check scrubber value - this is where the bug manifests
    // The scrubber should show the same value as the currentTime
    const scrubberInfo = await page.evaluate(() => {
      const scrubber = document.querySelector('.scrubber') as HTMLInputElement
      return scrubber ? {
        value: parseFloat(scrubber.value),
        valueAttr: scrubber.getAttribute('value'),
        currentTimeFromBinding: (scrubber as any).__vnode?.props?.value
      } : null
    })
    console.log('Scrubber info after +60:', scrubberInfo)
    scrubberValue = scrubberInfo?.value || 0
    console.log('Scrubber value after +60:', scrubberValue)
    console.log('Expected scrubber value:', expectedTime)
    console.log('Difference:', expectedTime - scrubberValue)

    // Verify that the scrubber visual position matches the currentTime
    // This tests the fix for the scrubber not updating when using jump buttons
    expect(scrubberValue).toBeCloseTo(expectedTime, 1)

    // Now click the -60 button to go back
    const minus60Button = page.locator('button.jump-btn:has-text("-60s")')
    await minus60Button.click()
    await page.waitForTimeout(100)

    // Verify we're back at 0
    currentTime = await page.evaluate(() => (window as any).$store.currentTime)
    console.log('Current time after -60:', currentTime)
    expect(currentTime).toBeCloseTo(0, 1)

    // Verify audio element's currentTime matches
    const audioTimeAfterMinus = await page.evaluate(() => {
      const audio = document.querySelector('audio') as HTMLAudioElement
      return audio ? audio.currentTime : null
    })
    console.log('Audio element currentTime after -60:', audioTimeAfterMinus)
    expect(audioTimeAfterMinus).toBeCloseTo(0, 1)

    // Check scrubber value again
    scrubberValue = await page.evaluate(() => {
      const scrubber = document.querySelector('.scrubber') as HTMLInputElement
      return scrubber ? parseFloat(scrubber.value) : null
    })
    console.log('Scrubber value after -60:', scrubberValue)
    expect(scrubberValue).toBeCloseTo(0, 1)
  })
})
