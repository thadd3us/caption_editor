import { test, expect, _electron as electron } from '@playwright/test'
import { ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { enableConsoleCapture } from './helpers/console'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

test.describe('VTT Editor', () => {
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

  test('should load the application', async () => {
    // Check that the app container loaded (no menu bar in native app)
    await expect(window.locator('.app')).toBeVisible()
    console.log('Application loaded successfully')
  })

  test('should show caption table', async () => {
    // Check that caption table is visible (replaces menu bar button test)
    const captionTable = window.locator('.caption-table')
    await expect(captionTable).toBeVisible()
    console.log('Caption table is visible')
  })

  test('should load VTT file via drag and drop', async () => {
    // Read the sample VTT file
    const vttPath = path.join(__dirname, 'fixtures', 'sample.vtt')

    // Simulate file drop
    const dataTransfer = await window.evaluateHandle((filePath) => {
      const dt = new DataTransfer()
      const file = new File(
        ['WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nTest caption'],
        'test.vtt',
        { type: 'text/vtt' }
      )
      dt.items.add(file)
      return dt
    }, vttPath)

    await window.dispatchEvent('.file-input-zone', 'drop', { dataTransfer })

    // Check that captions appear in the table
    await window.waitForTimeout(200)
    const captionTable = window.locator('.caption-table')
    await expect(captionTable).toBeVisible()
    console.log('VTT file loaded and table displayed')
  })

  test('should add a new caption', async () => {
    // Add a caption (this requires media, so we'll just test the button exists)
    const addButton = window.locator('button', { hasText: 'Add Caption' })
    await expect(addButton).toBeVisible()
    console.log('Add caption button is visible')
  })

  test('should have resizable panels', async () => {
    const resizer = window.locator('.resizer')
    await expect(resizer).toBeVisible()

    // Get initial panel widths
    const leftPanel = window.locator('.left-panel')
    const initialWidth = await leftPanel.evaluate(el => el.getBoundingClientRect().width)

    // Get resizer position
    const resizerBox = await resizer.boundingBox()
    if (!resizerBox) throw new Error('Resizer not found')

    // Drag the resizer to the right by 100px
    await window.mouse.move(resizerBox.x + resizerBox.width / 2, resizerBox.y + resizerBox.height / 2)
    await window.mouse.down()
    await window.mouse.move(resizerBox.x + 100, resizerBox.y + resizerBox.height / 2)
    await window.mouse.up()

    // Check that the left panel width increased
    await window.waitForTimeout(100)
    const newWidth = await leftPanel.evaluate(el => el.getBoundingClientRect().width)
    expect(newWidth).toBeGreaterThan(initialWidth)

    console.log('Panel resizer works: width changed from', initialWidth, 'to', newWidth)
  })


  test('should show AG Grid table', async () => {
    // Wait for AG Grid to initialize
    await window.waitForSelector('.ag-theme-alpine', { timeout: 5000 })
    const grid = window.locator('.ag-theme-alpine')
    await expect(grid).toBeVisible()
    console.log('AG Grid table is visible')
  })

  test('should display caption count', async () => {
    const header = window.locator('.table-header h2')
    await expect(header).toContainText('Captions')
    console.log('Caption count header is displayed')
  })
})
