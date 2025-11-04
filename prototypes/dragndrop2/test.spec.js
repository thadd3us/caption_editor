const { test, expect, _electron: electron } = require('@playwright/test')
const path = require('path')
const fs = require('fs')

test.describe('Drag and Drop v2 - f.path Test', () => {
  let electronApp
  let window

  test.beforeAll(async () => {
    console.log('[test] ==========================================')
    console.log('[test] Starting Electron app for f.path test...')
    console.log('[test] ==========================================')

    electronApp = await electron.launch({
      args: [
        path.join(__dirname, 'main.js'),
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ],
      env: {
        ...process.env,
        DISPLAY: process.env.DISPLAY || ':99'
      },
      executablePath: require('electron')
    })

    console.log('[test] Waiting for window...')
    window = await electronApp.firstWindow()

    console.log('[test] Waiting for page load...')
    await window.waitForLoadState('domcontentloaded')

    console.log('[test] App ready!')
  })

  test.afterAll(async () => {
    console.log('[test] Closing app...')
    if (electronApp) {
      await electronApp.close()
    }
  })

  test('should test if f.path is available in renderer', async () => {
    console.log('[test] ========== TEST START ==========')

    // Capture console logs
    window.on('console', msg => {
      console.log('[browser-console]', msg.text())
    })

    // Create test file
    const testFile = path.join(__dirname, 'test-drop-file.txt')
    fs.writeFileSync(testFile, 'Test content for f.path test')
    console.log('[test] Created test file:', testFile)

    // Wait for dropzone
    await window.waitForSelector('#dropzone')
    console.log('[test] Dropzone ready')

    // Take before screenshot
    await window.screenshot({ path: path.join(__dirname, 'before-test.png') })

    // Try to simulate drop - check if f.path exists
    const result = await window.evaluate(() => {
      // Create a fake File object
      const file = new File(['test'], 'test.txt', { type: 'text/plain' })

      console.log('[eval] Created File object')
      console.log('[eval] file.name:', file.name)
      console.log('[eval] file.path:', file.path)
      console.log('[eval] typeof file.path:', typeof file.path)

      // Check all properties
      const allKeys = []
      let obj = file
      let depth = 0
      while (obj && depth < 3) {
        const keys = Object.getOwnPropertyNames(obj)
        allKeys.push({ depth, keys })
        obj = Object.getPrototypeOf(obj)
        depth++
      }

      return {
        hasPath: file.path !== undefined,
        pathValue: file.path,
        typeofPath: typeof file.path,
        allKeys: allKeys
      }
    })

    console.log('[test] ========== EVALUATION RESULT ==========')
    console.log('[test] file.path available?', result.hasPath)
    console.log('[test] file.path value:', result.pathValue)
    console.log('[test] typeof file.path:', result.typeofPath)
    console.log('[test] Object keys:', JSON.stringify(result.allKeys, null, 2))

    // Wait a bit
    await window.waitForTimeout(1000)

    // Take after screenshot
    await window.screenshot({ path: path.join(__dirname, 'after-test.png') })

    // Check console for logs
    const consoleText = await window.locator('.console').textContent()
    console.log('[test] Console output:', consoleText)

    // Cleanup
    fs.unlinkSync(testFile)
    console.log('[test] Cleaned up test file')

    // Assert the key finding
    console.log('[test] ========================================')
    if (result.hasPath) {
      console.log('[test] ✓ SUCCESS: f.path IS available!')
      console.log('[test] This configuration WORKS for drag-and-drop')
    } else {
      console.log('[test] ✗ FAILURE: f.path is NOT available')
      console.log('[test] This configuration does NOT work for drag-and-drop')
    }
    console.log('[test] ========================================')

    // The test doesn't fail either way - we're just documenting findings
    expect(result).toBeDefined()
  })
})
