/**
 * Shared Electron instance for E2E tests.
 * 
 * This dramatically speeds up E2E tests by reusing a single Electron instance
 * across multiple tests instead of launching a new one for each test.
 * 
 * Usage:
 *   import { sharedElectronTest as test } from '../helpers/shared-electron'
 *   
 *   test('my test', async ({ electronApp, page }) => {
 *     // ... test code
 *   })
 */

import { test as base, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import { getElectronMainPath, getProjectRoot } from './project-root'
import { enableConsoleCapture } from './console'

// Shared state across all tests in a worker
let sharedApp: ElectronApplication | null = null
let sharedPage: Page | null = null

/**
 * Reset the app state between tests by:
 * 1. Clearing the VTT store
 * 2. Clearing media
 * 3. Resetting isDirty flag
 */
async function resetAppState(page: Page): Promise<void> {
    await page.evaluate(() => {
        const store = (window as any).$store || (window as any).store
        if (store) {
            // Reset document to empty
            store.document = {
                id: '',
                metadata: {},
                segments: [],
                history: [],
                filePath: undefined
            }
            // Clear media
            store.mediaPath = null
            store.mediaFilePath = null
            // Reset dirty flag
            store.isDirty = false
            // Reset current time
            store.currentTime = 0
            store.selectedCueId = null
        }
    })
    
    // Wait a tick for Vue to react
    await page.waitForTimeout(50)
}

/**
 * Extended test fixtures that provide shared Electron app and page.
 */
export const sharedElectronTest = base.extend<{
    electronApp: ElectronApplication
    page: Page
}>({
    // eslint-disable-next-line no-empty-pattern
    electronApp: async ({}, use) => {
        if (!sharedApp) {
            const env: Record<string, string> = {
                ...process.env as Record<string, string>,
                NODE_ENV: 'test',
            }
            
            // Set up code tree for ASR if available
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
            
            sharedApp = await electron.launch({
                args: [getElectronMainPath(), '--no-sandbox'],
                env,
            })
        }
        
        await use(sharedApp)
        // Don't close - we reuse across tests
    },
    
    page: async ({ electronApp }, use) => {
        if (!sharedPage) {
            sharedPage = await electronApp.firstWindow()
            enableConsoleCapture(sharedPage)
            
            // Wait for app to be ready
            await sharedPage.waitForLoadState('domcontentloaded')
            await sharedPage.waitForFunction(
                () => (window as any).$store || (window as any).store,
                { timeout: 10000 }
            )
        }
        
        // Reset state before each test
        await resetAppState(sharedPage)
        
        await use(sharedPage)
        // Don't close - we reuse
    },
})

/**
 * Clean up the shared Electron instance.
 * Call this in globalTeardown if using shared instances.
 */
export async function cleanupSharedElectron(): Promise<void> {
    if (sharedApp) {
        await sharedApp.close()
        sharedApp = null
        sharedPage = null
    }
}

// Export expect from base for convenience
export { expect } from '@playwright/test'
