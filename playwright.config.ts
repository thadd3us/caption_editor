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

// Skip expensive tests (ASR transcription/embedding) unless explicitly requested
const skipExpensive = process.env.SKIP_EXPENSIVE_TESTS === 'true'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  maxFailures: process.env.CI ? 10 : undefined,
  timeout: 30000, // 30 second timeout for Electron tests

  // Skip expensive ASR tests when SKIP_EXPENSIVE_TESTS=true
  // Uses negative lookahead to match tests that don't contain @expensive
  grep: skipExpensive ? /^(?!.*@expensive)/ : undefined,

  // Use platform-agnostic snapshot paths (remove -darwin/-linux suffixes)
  snapshotPathTemplate: '{testDir}/{testFileDir}/{testFileName}-snapshots/{arg}{ext}',

  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'], // Also show progress in terminal
    ['json', { outputFile: 'test-results.json' }]
  ],

  use: {
    headless: process.env.HEADLESS === 'true',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 3000, // 3 seconds for individual actions
  },

  // No projects/webServer needed - tests launch Electron directly using _electron.launch()
})
