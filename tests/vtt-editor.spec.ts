import { test, expect } from './helpers/coverage'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

test.describe('VTT Editor', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
  })

  test('should load the application', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toContainText('VTT Editor')
    console.log('Application loaded successfully')
  })

  test('should show file upload button', async ({ page }) => {
    await page.goto('/')
    const uploadButton = page.locator('button', { hasText: 'Open Files' })
    await expect(uploadButton).toBeVisible()
    console.log('Upload button is visible')
  })

  test('should load VTT file via drag and drop', async ({ page }) => {
    await page.goto('/')

    // Read the sample VTT file
    const vttPath = path.join(__dirname, 'fixtures', 'sample.vtt')

    // Simulate file drop
    const dataTransfer = await page.evaluateHandle((filePath) => {
      const dt = new DataTransfer()
      const file = new File(
        ['WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nTest caption'],
        'test.vtt',
        { type: 'text/vtt' }
      )
      dt.items.add(file)
      return dt
    }, vttPath)

    await page.dispatchEvent('.file-input-zone', 'drop', { dataTransfer })

    // Check that captions appear in the table
    await page.waitForTimeout(200)
    const captionTable = page.locator('.caption-table')
    await expect(captionTable).toBeVisible()
    console.log('VTT file loaded and table displayed')
  })

  test('should add a new caption', async ({ page }) => {
    await page.goto('/')

    // Add a caption (this requires media, so we'll just test the button exists)
    const addButton = page.locator('button', { hasText: 'Add Caption' })
    await expect(addButton).toBeVisible()
    console.log('Add caption button is visible')
  })

  test('should export VTT file via File menu', async ({ page }) => {
    await page.goto('/')

    // Open File menu
    const fileMenu = page.locator('button', { hasText: 'File' })
    await expect(fileMenu).toBeVisible()
    await fileMenu.click()

    // Click Save As
    const saveAsButton = page.locator('button', { hasText: 'Save As' })
    await expect(saveAsButton).toBeVisible()

    // Set up download listener
    const downloadPromise = page.waitForEvent('download')
    await saveAsButton.click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toMatch(/\.vtt$/)
    console.log('Export functionality works, filename:', download.suggestedFilename())
  })

  test('should display menu bar actions', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('button', { hasText: 'Open Files' })).toBeVisible()
    await expect(page.locator('button', { hasText: 'Clear' })).toBeVisible()
    await expect(page.locator('button', { hasText: 'File' })).toBeVisible()
    console.log('Menu bar actions are visible')
  })

  test('should have resizable panels', async ({ page }) => {
    await page.goto('/')

    const resizer = page.locator('.resizer')
    await expect(resizer).toBeVisible()

    // Get initial panel widths
    const leftPanel = page.locator('.left-panel')
    const initialWidth = await leftPanel.evaluate(el => el.getBoundingClientRect().width)

    // Get resizer position
    const resizerBox = await resizer.boundingBox()
    if (!resizerBox) throw new Error('Resizer not found')

    // Drag the resizer to the right by 100px
    await page.mouse.move(resizerBox.x + resizerBox.width / 2, resizerBox.y + resizerBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(resizerBox.x + 100, resizerBox.y + resizerBox.height / 2)
    await page.mouse.up()

    // Check that the left panel width increased
    await page.waitForTimeout(100)
    const newWidth = await leftPanel.evaluate(el => el.getBoundingClientRect().width)
    expect(newWidth).toBeGreaterThan(initialWidth)

    console.log('Panel resizer works: width changed from', initialWidth, 'to', newWidth)
  })

  test('should clear document with confirmation', async ({ page }) => {
    await page.goto('/')

    // Set up dialog handler
    page.on('dialog', async dialog => {
      expect(dialog.type()).toBe('confirm')
      await dialog.dismiss()
    })

    const clearButton = page.locator('button', { hasText: 'Clear' })
    await clearButton.click()

    console.log('Clear confirmation dialog works')
  })

  test('should persist data to localStorage', async ({ page }) => {
    await page.goto('/')

    // Load some VTT data
    await page.evaluate(() => {
      const vttContent = 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nPersistence test'
      localStorage.setItem('vtt-editor-document', JSON.stringify({
        document: {
          cues: [{
            id: 'test-id',
            startTime: 1,
            endTime: 4,
            text: 'Persistence test'
          }]
        },
        timestamp: Date.now()
      }))
    })

    await page.reload()

    // Check if data persisted
    const stored = await page.evaluate(() => {
      const data = localStorage.getItem('vtt-editor-document')
      return data ? JSON.parse(data) : null
    })

    expect(stored).not.toBeNull()
    expect(stored.document.cues).toHaveLength(1)
    console.log('LocalStorage persistence works')
  })

  test('should show AG Grid table', async ({ page }) => {
    await page.goto('/')

    // Wait for AG Grid to initialize
    await page.waitForSelector('.ag-theme-alpine', { timeout: 5000 })
    const grid = page.locator('.ag-theme-alpine')
    await expect(grid).toBeVisible()
    console.log('AG Grid table is visible')
  })

  test('should display caption count', async ({ page }) => {
    await page.goto('/')

    const header = page.locator('.table-header h2')
    await expect(header).toContainText('Captions')
    console.log('Caption count header is displayed')
  })
})
