import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/electron',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  timeout: 30000, // 30 seconds per test

  use: {
    trace: 'on-first-retry',
    actionTimeout: 10000, // 10 seconds for actions,
    launchOptions: {
      env: {
        ...process.env,
        DISPLAY: ':99',
      },
    },
  },

  projects: [
    {
      name: 'electron',
      testMatch: '**/*.electron.spec.ts',
    },
  ],
})
