const { test, expect, _electron: electron } = require('@playwright/test')

test.describe('Datalist Headless Crash', () => {
  let electronApp
  let window

  test.beforeAll(async () => {
    const isHeadless = process.env.HEADLESS === 'true'

    electronApp = await electron.launch({
      args: ['main.js', '--no-sandbox'],
      env: {
        ...process.env,
        HEADLESS: isHeadless ? 'true' : 'false'
      }
    })

    window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test('verify headless mode is active', async () => {
    // Check if we're actually in headless mode
    const isHeadless = process.env.HEADLESS === 'true'
    console.log('HEADLESS env var:', process.env.HEADLESS)
    console.log('Should be headless:', isHeadless)

    // In headless mode, the window should not be visible
    const browserWindow = await electronApp.browserWindow(window)
    const isVisible = await browserWindow.evaluate((win) => win.isVisible())
    console.log('Window isVisible():', isVisible)

    if (isHeadless) {
      expect(isVisible).toBe(false)
      console.log('✓ Confirmed: Running in HEADLESS mode (window is not visible)')
    } else {
      expect(isVisible).toBe(true)
      console.log('✓ Confirmed: Running in HEADED mode (window is visible)')
    }
  })

  test('regular input works in headless mode', async () => {
    const input = window.locator('.test-regular-input')
    await expect(input).toBeVisible()

    // This works fine
    await input.fill('Test value')
    const value = await input.inputValue()
    expect(value).toBe('Test value')
  })

  test('datalist with NON-EMPTY initial value works in headless', async () => {
    const input = window.locator('.test-datalist-prefilled')
    await expect(input).toBeVisible()

    // Check initial value
    let value = await input.inputValue()
    expect(value).toBe('Alice')

    // Change to another datalist value - this WORKS in headless
    await input.clear()
    await input.fill('Bob')

    value = await input.inputValue()
    expect(value).toBe('Bob')
  })

  test('datalist with EMPTY initial value crashes in headless', async () => {
    const input = window.locator('.test-datalist-empty')
    await expect(input).toBeVisible()

    // Check it starts empty
    let value = await input.inputValue()
    expect(value).toBe('')

    // Get the HTML to show datalist is present
    const html = await input.evaluate(el => el.outerHTML)
    console.log('Input HTML:', html)
    expect(html).toContain('list="names-list"')

    // This crashes Electron in headless mode when:
    // 1. Initial value is empty
    // 2. Setting to a value that exists in datalist
    await input.fill('Alice')

    value = await input.inputValue()
    expect(value).toBe('Alice')
  })

  test('datalist empty -> datalist value via JS also crashes', async () => {
    const input = window.locator('.test-datalist-empty')
    await expect(input).toBeVisible()

    // Clear it first
    await input.clear()

    // Even setting via JavaScript crashes in headless
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
