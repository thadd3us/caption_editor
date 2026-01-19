// Pure Electron test - no Playwright involved
// This tests if the crash is an Electron bug or a Playwright bug

const { app, BrowserWindow } = require('electron')

function log(message) {
  console.log(`[TEST] ${message}`)
}

async function runTest() {
  const hideWindow = process.env.HEADLESS === 'true'

  log('========================================')
  log('Pure Electron Test (No Playwright)')
  log(`Window hidden (show=false): ${hideWindow}`)
  log('========================================')

  const win = new BrowserWindow({
    width: 800,
    height: 600,
    show: !hideWindow,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true  // Enable for easier testing
    }
  })

  log('Window created, loading HTML...')

  win.loadFile('index.html')

  // Wait for page to load with timeout
  await Promise.race([
    new Promise(resolve => win.webContents.once('did-finish-load', resolve)),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Page load timeout')), 5000))
  ])

  log('Page loaded, waiting for rendering...')
  await new Promise(resolve => setTimeout(resolve, 1000))

  try {
    // Test 1: Regular input (baseline)
    log('Test 1: Setting regular input value...')
    await win.webContents.executeJavaScript(`
      const input = document.querySelector('.test-regular-input');
      if (!input) throw new Error('Regular input not found');
      input.value = 'Test Value';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      'ok'
    `)
    log('✓ Test 1 PASSED')

    // Test 2: Datalist input (prefilled)
    log('Test 2: Setting datalist input (prefilled)...')
    const result2 = await win.webContents.executeJavaScript(`
      try {
        const input = document.querySelector('.test-datalist-prefilled');
        if (!input) throw new Error('Prefilled datalist input not found');
        input.value = 'Bob';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        'ok'
      } catch (e) {
        e.message
      }
    `)
    log(`Test 2 result: ${result2}`)
    if (result2 !== 'ok') throw new Error(`Test 2 failed: ${result2}`)
    log('✓ Test 2 PASSED')

    // Test 3: Datalist input (empty) - critical test
    log('Test 3: Setting datalist input (empty)...')
    const result3 = await win.webContents.executeJavaScript(`
      try {
        const input = document.querySelector('.test-datalist-empty');
        if (!input) throw new Error('Empty datalist input not found');
        input.value = 'Alice';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        'ok'
      } catch (e) {
        e.message
      }
    `)
    log(`Test 3 result: ${result3}`)
    if (result3 !== 'ok') throw new Error(`Test 3 failed: ${result3}`)
    log('✓ Test 3 PASSED')

    log('========================================')
    log('ALL TESTS PASSED ✓')
    log('Plain JavaScript works fine with datalist inputs')
    log('Conclusion: This is likely a PLAYWRIGHT bug')
    log('========================================')

  } catch (error) {
    log('========================================')
    log(`✗ TEST FAILED: ${error.message}`)
    log('Conclusion: Electron issue detected')
    log('========================================')
  }

  log('Exiting...')
  setTimeout(() => process.exit(0), 500)
}

app.whenReady().then(() => {
  runTest().catch(error => {
    log(`ERROR: ${error.message}`)
    process.exit(1)
  })
})

app.on('window-all-closed', () => {
  // Don't quit - let the test finish
})
