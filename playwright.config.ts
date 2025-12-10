import { defineConfig } from '@playwright/test'
import { checkXvfbAvailable } from './tests/helpers/xvfb-check'

/**
 * Playwright configuration for VTT Caption Editor
 *
 * This app is Electron-only, so all tests run in Electron (no browser mode).
 * Tests are organized into two directories:
 * - tests/*.spec.ts: UI/interaction tests
 * - tests/electron/*.spec.ts: Electron platform tests (file system, IPC, etc.)
 *
 * Both test suites run in Electron and require the app to be built first:
 *   npm run build:all
 *
 * Platform notes:
 * - macOS: Tests run natively without special setup
 * - Linux: Requires Xvfb (run start-xvfb.sh first, then set DISPLAY=:99)
 */

// Check Xvfb availability on Linux before running tests
checkXvfbAvailable()

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  maxFailures: process.env.CI ? 10 : undefined,
  timeout: 30000, // 30 second timeout for Electron tests

  // Use platform-agnostic snapshot paths (remove -darwin/-linux suffixes)
  snapshotPathTemplate: '{testDir}/{testFileDir}/{testFileName}-snapshots/{arg}{ext}',

  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'], // Also show progress in terminal
    ['json', { outputFile: 'test-results.json' }]
  ],

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10000, // 10 seconds for individual actions
  },

  // No projects/webServer needed - tests launch Electron directly using _electron.launch()
})
