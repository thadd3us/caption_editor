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

  test('should test webUtils.getPathForFile availability', async () => {
    console.log('[test] ========== TEST START ==========')
    console.log('[test] Testing if webUtils.getPathForFile is available')

    // Capture console logs
    const logs = []
    window.on('console', msg => {
      const text = msg.text()
      logs.push(text)
      console.log('[browser-console]', text)
    })

    // Wait for page to be ready
    await window.waitForSelector('#dropzone')
    console.log('[test] Dropzone ready')

    // Take screenshot
    await window.screenshot({ path: path.join(__dirname, 'test-screenshot.png') })

    // Check if webUtils API is available
    const result = await window.evaluate(() => {
      console.log('[eval] Checking window.fileDrop API...')
      console.log('[eval] window.fileDrop:', !!window.fileDrop)
      console.log('[eval] window.fileDrop.getPathForFile:', !!window.fileDrop?.getPathForFile)

      // Try to call it with a synthetic File (will fail, but we can see if API exists)
      let apiExists = false
      let apiCallable = false
      let error = null

      if (window.fileDrop && window.fileDrop.getPathForFile) {
        apiExists = true
        console.log('[eval] ✓ getPathForFile API exists!')

        try {
          // Try calling with a fake file - this won't give us a path but proves the API works
          const fakeFile = new File(['test'], 'test.txt', { type: 'text/plain' })
          const result = window.fileDrop.getPathForFile(fakeFile)
          console.log('[eval] API call result:', result)
          console.log('[eval] Result type:', typeof result)
          apiCallable = true
        } catch (e) {
          error = e.message
          console.log('[eval] API call error:', e.message)
        }
      } else {
        console.log('[eval] ✗ getPathForFile API NOT available')
      }

      return {
        apiExists,
        apiCallable,
        error
      }
    })

    console.log('[test] ========== TEST RESULTS ==========')
    console.log('[test] API exists:', result.apiExists)
    console.log('[test] API callable:', result.apiCallable)
    if (result.error) {
      console.log('[test] Error:', result.error)
    }

    // Check preload logs for webUtils
    const preloadLogs = logs.filter(l => l.includes('[preload]') && l.includes('webUtils'))
    console.log('[test] Preload webUtils logs:', preloadLogs)

    // Wait to see console output
    await window.waitForTimeout(1000)

    console.log('[test] ========================================')
    if (result.apiExists) {
      console.log('[test] ✓ SUCCESS: webUtils.getPathForFile API is available!')
      console.log('[test] The API can be called from renderer')
      if (!result.apiCallable) {
        console.log('[test] Note: Synthetic File objects don\'t have paths (expected)')
        console.log('[test] Real drag-dropped files should work')
      }
    } else {
      console.log('[test] ✗ FAILURE: webUtils.getPathForFile API is NOT available')
      console.log('[test] Check preload script imports and contextBridge setup')
    }
    console.log('[test] ========================================')

    // Assert that the API exists
    expect(result.apiExists).toBe(true)
  })
})
