import { test as base } from '@playwright/test'
import fs from 'fs'
import path from 'path'

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript(() => {
      (window as any).__coverage__ = (window as any).__coverage__ || {}
    })
    await use(context)

    // Save coverage after each test
    for (const page of context.pages()) {
      const coverage = await page.evaluate(() => (window as any).__coverage__)
      if (coverage) {
        const coverageDir = path.join(process.cwd(), '.nyc_output')
        if (!fs.existsSync(coverageDir)) {
          fs.mkdirSync(coverageDir, { recursive: true })
        }
        const coverageFile = path.join(
          coverageDir,
          `coverage-${Date.now()}-${Math.random().toString(36).substring(7)}.json`
        )
        fs.writeFileSync(coverageFile, JSON.stringify(coverage))
      }
    }
  },
})

export { expect } from '@playwright/test'
