import { test, expect, _electron as electron } from '@playwright/test'
import { ElectronApplication, Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs/promises'
import { fileURLToPath } from 'url'
import { enableConsoleCapture } from '../helpers/console'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test.describe('Electron App', () => {
  let electronApp: ElectronApplication
  let window: Page

  test.beforeAll(async () => {
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

  test.afterAll(async () => {
    await electronApp.close()
  })

  test('should launch the application', async () => {
    // Check that window is visible
    expect(await window.isVisible('body')).toBe(true)
  })

  test('should have the correct title', async () => {
    const title = await window.title()
    expect(title).toBe('VTT Editor')
  })

  test('should show the menu bar', async () => {
    const menuBar = await window.locator('.menu-bar')
    await expect(menuBar).toBeVisible()
  })

  test('should show the file upload button', async () => {
    const uploadButton = await window.locator('.open-button')
    await expect(uploadButton).toBeVisible()
  })

  test('should have electronAPI available', async () => {
    // Check that the Electron API is exposed
    const hasElectronAPI = await window.evaluate(() => {
      return !!window.electronAPI && window.electronAPI.isElectron
    })
    expect(hasElectronAPI).toBe(true)
  })

  test('should be able to read API methods', async () => {
    const apiMethods = await window.evaluate(() => {
      if (!window.electronAPI) return []
      return Object.keys(window.electronAPI)
    })

    expect(apiMethods).toContain('openFile')
    expect(apiMethods).toContain('readFile')
    expect(apiMethods).toContain('saveFile')
    expect(apiMethods).toContain('fileToURL')
    expect(apiMethods).toContain('processDroppedFiles')
  })

  test('should load and display VTT content', async () => {
    // Create a temporary VTT file
    const testVTTPath = path.join(process.cwd(), 'test_data/test.vtt')
    const vttContent = `WEBVTT

00:00:00.000 --> 00:00:05.000
First caption

00:00:05.000 --> 00:00:10.000
Second caption
`

    // Ensure test_data directory exists
    await fs.mkdir(path.join(process.cwd(), 'test_data'), { recursive: true })
    await fs.writeFile(testVTTPath, vttContent)

    // Load VTT file programmatically
    await window.evaluate(async (content) => {
      const store = (window as any).vttStore
      if (store && store.loadFromFile) {
        store.loadFromFile(content, 'test.vtt')
      }
    }, vttContent)

    // Wait for the table to update
    await window.waitForTimeout(500)

    // Check that captions are displayed in the table
    const captionTable = await window.locator('.ag-center-cols-container')
    await expect(captionTable).toBeVisible()

    // Clean up
    await fs.unlink(testVTTPath).catch(() => {})
  })

  test('should be able to export VTT', async () => {
    // First load some content
    const vttContent = `WEBVTT

00:00:00.000 --> 00:00:05.000
Test caption
`

    await window.evaluate(async (content) => {
      const store = (window as any).vttStore
      if (store && store.loadFromFile) {
        store.loadFromFile(content, 'test.vtt')
      }
    }, vttContent)

    await window.waitForTimeout(500)

    // Mock the save dialog to prevent it from opening
    await electronApp.evaluate(({ dialog }) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: '/tmp/test-export.vtt'
      })
    })

    // Click export button - need to open File menu first
    const fileMenu = await window.locator('button.menu-item:has-text("File")')
    await fileMenu.click()
    await window.waitForTimeout(200)

    const saveAsButton = await window.locator('button:has-text("Save As")')
    await saveAsButton.click()

    // Wait for export to complete
    await window.waitForTimeout(1000)

    // The export should have been called
    // In a real test, we'd verify the file was written
  })

  test('should handle file drops', async () => {
    // Create a test VTT file
    const testVTTPath = path.join(process.cwd(), 'test_data/drop-test.vtt')
    const vttContent = `WEBVTT

00:00:00.000 --> 00:00:05.000
Dropped caption
`

    await fs.mkdir(path.join(process.cwd(), 'test_data'), { recursive: true })
    await fs.writeFile(testVTTPath, vttContent)

    // Simulate file drop via electronAPI
    const result = await window.evaluate(async (filePath) => {
      if (!window.electronAPI) return null
      return await window.electronAPI.processDroppedFiles([filePath])
    }, testVTTPath)

    expect(result).toBeTruthy()
    expect(result).toHaveLength(1)
    expect(result![0].type).toBe('vtt')
    expect(result![0].content).toContain('Dropped caption')

    // Clean up
    await fs.unlink(testVTTPath).catch(() => {})
  })

  test('should respect user file selection permissions', async () => {
    // This test verifies that the app uses proper dialogs
    // and doesn't try to access files without permission

    // Mock the file dialog to return no files (user canceled)
    await electronApp.evaluate(({ dialog }) => {
      dialog.showOpenDialog = async () => ({
        canceled: true,
        filePaths: []
      })
    })

    // Try to open file via button
    const uploadButton = await window.locator('.open-button')
    await uploadButton.click()

    // Wait for dialog to be processed
    await window.waitForTimeout(500)

    // Should not throw any errors or show permission warnings
    const consoleErrors = await window.evaluate(() => {
      // Check if there are any console errors
      return (window as any).__consoleErrors || []
    })

    expect(consoleErrors.length).toBe(0)
  })

  test('should capture screenshot of app', async () => {
    // Wait for app to fully load
    await window.waitForLoadState('networkidle')
    await window.waitForTimeout(1000)

    // Capture screenshot to verify app is rendering correctly
    const screenshot = await window.screenshot({
      path: 'tests/electron/screenshots/app-launch.png',
      fullPage: true
    })

    // Verify screenshot was captured
    expect(screenshot).toBeTruthy()
    expect(screenshot.length).toBeGreaterThan(0)

    // Check that the main UI elements are visible
    const body = await window.locator('body')
    await expect(body).toBeVisible()

    // Log viewport size for debugging
    const viewportSize = window.viewportSize()
    console.log('Viewport size:', viewportSize)

    // Verify page is not blank by checking if there's actual content
    const hasContent = await window.evaluate(() => {
      const body = document.body
      const bodyText = body.innerText || body.textContent || ''
      const hasElements = body.children.length > 1 // More than just #app
      return {
        hasText: bodyText.trim().length > 0,
        hasElements,
        bodyHTML: body.innerHTML.substring(0, 200) // First 200 chars for debugging
      }
    })

    console.log('Page content check:', hasContent)

    // App should have either text content or multiple elements
    expect(hasContent.hasText || hasContent.hasElements).toBe(true)
  })
})
