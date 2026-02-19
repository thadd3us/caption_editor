import { test, expect, _electron as electron } from '@playwright/test'
import { getElectronMainPath, getProjectRoot } from '../helpers/project-root'

test.describe('License Agreement Dialog', () => {
  test('should show license dialog on first run and persist acceptance', async () => {
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      NODE_ENV: 'test',
    }

    const projectRoot = getProjectRoot()
    env.CAPTION_EDITOR_RUN_TRANSCRIBE_FROM_CODE_TREE = '1'
    env.CAPTION_EDITOR_CODE_TREE_ROOT = projectRoot

    if (process.env.DISPLAY) {
      env.DISPLAY = process.env.DISPLAY
    } else if (process.platform === 'linux') {
      env.DISPLAY = ':99'
    }

    if (process.env.HEADLESS === 'true') {
      env.HEADLESS = 'true'
    }

    const electronApp = await electron.launch({
      args: [getElectronMainPath(), '--no-sandbox'],
      env,
    })

    try {
      const page = await electronApp.firstWindow()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForFunction(
        () => (window as any).$store || (window as any).store,
        { timeout: 10000 }
      )

      // Clear localStorage to simulate first run
      await page.evaluate(() => localStorage.removeItem('caption-editor-license-accepted'))
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForFunction(
        () => (window as any).$store || (window as any).store,
        { timeout: 10000 }
      )

      // License dialog should appear
      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible({ timeout: 5000 })
      await expect(dialog.locator('h2', { hasText: 'License Agreement' })).toBeVisible()
      await expect(dialog.locator('text=MIT License')).toBeVisible()

      // Click "I Agree"
      await page.locator('button', { hasText: 'I Agree' }).click()

      // Dialog should close
      await expect(dialog).not.toBeVisible({ timeout: 2000 })

      // localStorage should be set
      const accepted = await page.evaluate(() => localStorage.getItem('caption-editor-license-accepted'))
      expect(accepted).toBe('true')

      // After reload, dialog should NOT appear
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForFunction(
        () => (window as any).$store || (window as any).store,
        { timeout: 10000 }
      )
      await page.waitForTimeout(1000)
      await expect(dialog).not.toBeVisible()
    } finally {
      await electronApp.close()
    }
  })
})
