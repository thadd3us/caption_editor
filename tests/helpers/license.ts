import { Page } from '@playwright/test'

/**
 * Accept the license agreement dialog if it's visible.
 * Call this after the app loads to dismiss the first-run license dialog.
 */
export async function acceptLicenseIfVisible(page: Page): Promise<void> {
    try {
        const agreeButton = page.locator('button', { hasText: 'I Agree' })
        if (await agreeButton.isVisible({ timeout: 1000 })) {
            await agreeButton.click()
            // Wait for dialog to close
            await agreeButton.waitFor({ state: 'hidden', timeout: 2000 })
        }
    } catch {
        // Dialog not present, that's fine
    }
}
