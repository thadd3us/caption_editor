const { test, expect, _electron: electron } = require('@playwright/test')
const path = require('path')

test.describe('Drag and Drop File Path Test', () => {
  let electronApp
  let window

  test.beforeAll(async () => {
    console.log('[test] Starting Electron app...')

    // Launch Electron app
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

    console.log('[test] Waiting for first window...')
    window = await electronApp.firstWindow()

    console.log('[test] Window loaded, waiting for page to be ready...')
    await window.waitForLoadState('domcontentloaded')

    console.log('[test] Page ready!')
  })

  test.afterAll(async () => {
    console.log('[test] Closing Electron app...')
    await electronApp.close()
  })

  test('should extract file paths from dropped files', async () => {
    console.log('[test] ===== Starting drag-and-drop test =====')

    // Create test files in the prototype directory
    const testFile1 = path.join(__dirname, 'test-file-1.txt')
    const testFile2 = path.join(__dirname, 'test-file-2.vtt')

    const fs = require('fs')
    fs.writeFileSync(testFile1, 'Test file 1 content')
    fs.writeFileSync(testFile2, 'WEBVTT\n\nTest VTT file')

    console.log('[test] Created test files:')
    console.log('[test]   -', testFile1)
    console.log('[test]   -', testFile2)

    // Set up console logging from the renderer
    window.on('console', msg => {
      const text = msg.text()
      console.log('[renderer-console]', text)
    })

    // Take a screenshot before
    await window.screenshot({ path: path.join(__dirname, 'before-drop.png') })
    console.log('[test] Screenshot saved: before-drop.png')

    // Wait for the drop zone to be visible
    await window.waitForSelector('.drop-zone', { state: 'visible' })
    console.log('[test] Drop zone is visible')

    // Get the drop zone element
    const dropZone = await window.locator('.drop-zone')
    const box = await dropZone.boundingBox()
    console.log('[test] Drop zone bounding box:', box)

    // Simulate file drop using Playwright's setInputFiles
    // This is a workaround since Playwright doesn't directly support drag-and-drop of files
    console.log('[test] Attempting to trigger drop via dispatchEvent...')

    // Method 1: Try to dispatch a drop event with files
    await window.evaluate(({ testFile1, testFile2 }) => {
      console.log('[injected] Creating synthetic drop event')
      console.log('[injected] File paths:', testFile1, testFile2)

      // Create a DataTransfer object
      const dataTransfer = new DataTransfer()

      // Note: We can't actually create File objects with paths in the browser
      // But let's try anyway and see what happens
      console.log('[injected] Creating File objects...')

      // Create File objects (without paths)
      const file1 = new File(['Test file 1 content'], 'test-file-1.txt', { type: 'text/plain' })
      const file2 = new File(['WEBVTT\n\nTest VTT file'], 'test-file-2.vtt', { type: 'text/vtt' })

      console.log('[injected] File 1:', file1)
      console.log('[injected] File 1.path:', file1.path)
      console.log('[injected] File 2:', file2)
      console.log('[injected] File 2.path:', file2.path)

      dataTransfer.items.add(file1)
      dataTransfer.items.add(file2)

      // Create and dispatch drop event
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dataTransfer
      })

      console.log('[injected] Dispatching drop event...')
      document.dispatchEvent(dropEvent)
      console.log('[injected] Drop event dispatched')

      return {
        file1HasPath: file1.path !== undefined,
        file2HasPath: file2.path !== undefined,
        file1Path: file1.path,
        file2Path: file2.path
      }
    }, { testFile1, testFile2 })

    console.log('[test] Waiting for results to appear...')
    await window.waitForTimeout(2000)

    // Take a screenshot after
    await window.screenshot({ path: path.join(__dirname, 'after-drop.png') })
    console.log('[test] Screenshot saved: after-drop.png')

    // Check if results appeared
    const resultDiv = await window.locator('#result')
    const resultContent = await resultDiv.innerHTML()
    console.log('[test] Result div content:', resultContent)

    // Get all console logs that were captured
    console.log('[test] ===== Test complete =====')
    console.log('[test] Check the screenshots and console output above')

    // The test doesn't assert anything specific - we're just observing what happens
    expect(resultContent).toBeDefined()

    // Cleanup
    fs.unlinkSync(testFile1)
    fs.unlinkSync(testFile2)
    console.log('[test] Cleaned up test files')
  })

  test('should check File object properties in Electron context', async () => {
    console.log('[test] ===== Checking File object properties =====')

    const result = await window.evaluate(() => {
      // Create a File object and inspect it
      const file = new File(['test'], 'test.txt', { type: 'text/plain' })

      console.log('[eval] Created File object:', file)
      console.log('[eval] File.name:', file.name)
      console.log('[eval] File.size:', file.size)
      console.log('[eval] File.type:', file.type)
      console.log('[eval] File.path:', file.path)
      console.log('[eval] typeof File.path:', typeof file.path)

      // Get all own properties
      const ownProps = Object.getOwnPropertyNames(file)
      console.log('[eval] Own properties:', ownProps)

      // Get all properties including prototype chain
      const allProps = []
      let obj = file
      let depth = 0
      while (obj && depth < 5) {
        const props = Object.getOwnPropertyNames(obj)
        allProps.push({ depth, props })
        console.log(`[eval] Properties at depth ${depth}:`, props)
        obj = Object.getPrototypeOf(obj)
        depth++
      }

      return {
        hasPath: file.path !== undefined,
        pathValue: file.path,
        ownProps,
        allProps
      }
    })

    console.log('[test] File object inspection result:', JSON.stringify(result, null, 2))

    // Log the findings
    console.log('[test] ===== FINDINGS =====')
    console.log('[test] File.path available?', result.hasPath)
    console.log('[test] File.path value:', result.pathValue)
    console.log('[test] Own properties:', result.ownProps)
  })
})
