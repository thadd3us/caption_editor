import { test, expect } from './helpers/coverage'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

test.describe('Playhead/Table Simple Test', () => {
  test('table row selection should move playhead', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()

    // Load audio file
    const audioPath = path.join(__dirname, 'fixtures', 'test-audio-10s.wav')
    await page.evaluate((filePath) => {
      const audioUrl = `file://${filePath}`
      ;(window as any).$store.loadMediaFile(audioUrl)
    }, audioPath)

    await page.waitForTimeout(200)

    // Add a cue at 2 seconds - set currentTime directly via store
    await page.evaluate(() => {
      ;(window as any).$store.setCurrentTime(2)
    })
    await page.waitForTimeout(100)

    // Verify currentTime was set to 2
    let currentTime = await page.evaluate(() => (window as any).$store.currentTime)
    console.log('Current time before adding caption:', currentTime)
    expect(currentTime).toBeCloseTo(2, 1)

    const addCaptionBtn = page.locator('.add-caption-btn')
    await addCaptionBtn.click()
    await page.waitForTimeout(100)

    // Verify row was added
    const rowCount = await page.locator('.ag-row').count()
    expect(rowCount).toBe(1)

    // Check the cue in localStorage
    const stored = await page.evaluate(() => {
      const data = localStorage.getItem('vtt-editor-document')
      return data ? JSON.parse(data) : null
    })
    console.log('Stored cue:', stored.document.cues[0])
    expect(stored.document.cues[0].startTime).toBeCloseTo(2, 1)

    // Move playhead away from the cue
    await page.evaluate(() => {
      ;(window as any).$store.setCurrentTime(0)
    })
    await page.waitForTimeout(100)

    // Verify playhead is at 0
    currentTime = await page.evaluate(() => (window as any).$store.currentTime)
    expect(currentTime).toBeCloseTo(0, 1)

    // Click the row
    console.log('Clicking row...')

    // Listen to console logs from the page
    page.on('console', msg => console.log('PAGE LOG:', msg.text()))

    await page.locator('.ag-row').first().click()
    await page.waitForTimeout(300)

    // Verify playhead moved to start of cue (2s)
    currentTime = await page.evaluate(() => (window as any).$store.currentTime)
    console.log('Current time after click:', currentTime)
    expect(currentTime).toBeCloseTo(2, 1)

    // Note: The scrubber's displayed value doesn't update reactively when currentTime changes programmatically
    // This is a known limitation - the scrubber uses :value binding which only sets initial value
    // The time display shows correct value, and playback works correctly
    // TODO: Consider fixing scrubber reactivity in MediaPlayer component

    console.log('Test passed!')
  })
})
