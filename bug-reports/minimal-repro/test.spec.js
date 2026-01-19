const { test, expect, _electron: electron } = require('@playwright/test')

test.describe('Datalist Crash with Hidden Window (show=false)', () => {
  let electronApp
  let window

  test.beforeAll(async () => {
    const hideWindow = process.env.HEADLESS === 'true'

    electronApp = await electron.launch({
      args: ['main.js', '--no-sandbox'],
      env: {
        ...process.env,
        HEADLESS: hideWindow ? 'true' : 'false'  // Controls BrowserWindow show option
      }
    })

    window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test('verify window visibility (show option)', async () => {
    // Check BrowserWindow visibility via the show option
    const hideWindow = process.env.HEADLESS === 'true'
    console.log('HEADLESS env var:', process.env.HEADLESS)
    console.log('Window should be hidden:', hideWindow)

    // Check actual window visibility
    const browserWindow = await electronApp.browserWindow(window)
    const isVisible = await browserWindow.evaluate((win) => win.isVisible())
    console.log('Window isVisible():', isVisible)

    if (hideWindow) {
      expect(isVisible).toBe(false)
      console.log('✓ Confirmed: BrowserWindow created with show=false (not visible)')
    } else {
      expect(isVisible).toBe(true)
      console.log('✓ Confirmed: BrowserWindow created with show=true (visible)')
    }
  })

  test('regular input works with hidden window', async () => {
    const input = window.locator('.test-regular-input')
    await expect(input).toBeVisible()

    // This works fine
    await input.fill('Test value')
    const value = await input.inputValue()
    expect(value).toBe('Test value')
  })

  test('datalist with NON-EMPTY initial value crashes with hidden window', async () => {
    const input = window.locator('.test-datalist-prefilled')
    await expect(input).toBeVisible()

    // Check initial value
    let value = await input.inputValue()
    expect(value).toBe('Alice')

    // Change to another datalist value - this CRASHES with hidden window
    await input.clear()
    await input.fill('Bob')

    value = await input.inputValue()
    expect(value).toBe('Bob')
  })

  test('datalist with EMPTY initial value crashes with hidden window', async () => {
    const input = window.locator('.test-datalist-empty')
    await expect(input).toBeVisible()

    // Check it starts empty
    let value = await input.inputValue()
    expect(value).toBe('')

    // Get the HTML to show datalist is present
    const html = await input.evaluate(el => el.outerHTML)
    console.log('Input HTML:', html)
    expect(html).toContain('list="names-list"')

    // This crashes Electron when window has show=false:
    // 1. Input has datalist
    // 2. Using Playwright's .fill() method
    await input.fill('Alice')

    value = await input.inputValue()
    expect(value).toBe('Alice')
  })

  test('datalist with JavaScript setValue works (no crash)', async () => {
    const input = window.locator('.test-datalist-empty')
    await expect(input).toBeVisible()

    // Clear it first
    await input.clear()

    // Setting via JavaScript works fine (no crash) even with hidden window
    await window.evaluate(() => {
      const input = document.querySelector('.test-datalist-empty')
      if (input) {
        input.value = 'Bob'  // Value from datalist
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
    })

    await window.waitForTimeout(100)

    const value = await input.inputValue()
    expect(value).toBe('Bob')
  })
})
