import { test, expect } from './helpers/coverage'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import * as fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

test.describe('File Drop Zone', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.reload()
  })

  test('should load media file via drag and drop', async ({ page }) => {
    test.setTimeout(15000)

    // Get the file path
    const audioFilePath = path.resolve(__dirname, 'fixtures', 'OSR_us_000_0010_8k.wav')

    // Read file into buffer
    const buffer = fs.readFileSync(audioFilePath)

    // Create a DataTransfer to simulate drag and drop
    const dataTransfer = await page.evaluateHandle((data) => {
      const dt = new DataTransfer()
      const file = new File([new Uint8Array(data.buffer)], data.name, { type: 'audio/wav' })
      dt.items.add(file)
      return dt
    }, {
      buffer: Array.from(buffer),
      name: 'OSR_us_000_0010_8k.wav'
    })

    // Simulate drop event on the drop zone
    await page.dispatchEvent('.file-input-zone', 'drop', { dataTransfer })

    // Wait for file to be processed
    await page.waitForTimeout(500)

    // Verify audio element was created
    const hasAudio = await page.evaluate(() => {
      const audio = document.querySelector('audio')
      return !!audio
    })
    expect(hasAudio).toBe(true)

    // Verify filename is displayed (in browser context, will likely just be the filename without path)
    const displayedPath = await page.locator('.media-filename').textContent()
    console.log('Displayed path:', displayedPath)
    expect(displayedPath).toContain('OSR_us_000_0010_8k.wav')

    // Verify store has the file path
    const storedFilePath = await page.evaluate(() => (window as any).$store.mediaFilePath)
    console.log('Stored file path:', storedFilePath)
    // In browser context, this will be the filename since full path isn't accessible
    expect(storedFilePath).toContain('OSR_us_000_0010_8k.wav')

    // Wait for audio to load
    let duration = 0
    for (let i = 0; i < 10; i++) {
      duration = await page.evaluate(() => {
        const audio = document.querySelector('audio') as HTMLAudioElement
        return audio ? audio.duration : 0
      })
      if (!isNaN(duration) && duration > 0) {
        break
      }
      await page.waitForTimeout(200)
    }
    console.log('Audio duration:', duration)
    expect(duration).toBeGreaterThan(0)

    // Verify media info display is visible
    const mediaInfo = page.locator('.media-info')
    await expect(mediaInfo).toBeVisible()

    // Test playback control works
    const plus60Button = page.locator('button.jump-btn:has-text("+60s")')
    await plus60Button.click()
    await page.waitForTimeout(200)

    const currentTime = await page.evaluate(() => (window as any).$store.currentTime)
    console.log('Current time after +60:', currentTime)
    expect(currentTime).toBeGreaterThan(0)
  })
})
