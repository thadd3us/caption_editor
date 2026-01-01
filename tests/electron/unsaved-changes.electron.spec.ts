import { test, expect, _electron as electron } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

test.describe('Unsaved Changes Warning', () => {
    let tmpDir: string

    test.beforeAll(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unsaved-changes-test-'))
    })

    test.afterAll(() => {
        if (fs.existsSync(tmpDir)) {
            // fs.rmSync(tmpDir, { recursive: true, force: true })
        }
    })

    test('should warn on unsaved changes when opening another file', async () => {
        const electronApp = await electron.launch({
            args: [path.join(__dirname, '../../dist-electron/main.cjs')],
            env: {
                ...process.env,
                NODE_ENV: 'production'
            }
        })

        const page = await electronApp.firstWindow()

        // Wait for Vue app to mount
        await page.waitForFunction(() => (window as any).$store || (window as any).store, { timeout: 10000 })

        // 1. Initially NOT dirty
        const initialDirty = await page.evaluate(() => {
            const store = (window as any).$store || (window as any).store
            return store.isDirty
        })
        expect(initialDirty).toBe(false)

        // 2. Make an edit (add a cue)
        await page.evaluate(() => {
            const store = (window as any).$store || (window as any).store
            store.addCue(0, 5)
        })

        // 3. Now it SHOULD be dirty
        const afterEditDirty = await page.evaluate(() => {
            const store = (window as any).$store || (window as any).store
            return store.isDirty
        })
        expect(afterEditDirty).toBe(true)

        // 4. Try to open a file (this should trigger handleMenuOpenFile)
        // We'll mock window.confirm to check if it was called
        let confirmCalled = false
        page.on('dialog', async dialog => {
            if (dialog.type() === 'confirm' && dialog.message().includes('unsaved changes')) {
                confirmCalled = true
                await dialog.accept() // Discard changes
            } else {
                await dialog.dismiss()
            }
        })

        // Trigger handleMenuOpenFile directly
        await page.evaluate(() => {
            (window as any).handleMenuOpenFile()
        })

        expect(confirmCalled).toBe(true)

        await electronApp.close()
    })

    test('should NOT warn if NO unsaved changes when opening another file', async () => {
        const electronApp = await electron.launch({
            args: [path.join(__dirname, '../../dist-electron/main.cjs')],
            env: {
                ...process.env,
                NODE_ENV: 'production'
            }
        })

        const page = await electronApp.firstWindow()
        await page.waitForFunction(() => (window as any).$store || (window as any).store, { timeout: 10000 })

        let confirmCalled = false
        page.on('dialog', async () => {
            confirmCalled = true
        })

        await page.evaluate(() => {
            (window as any).handleMenuOpenFile()
        })

        expect(confirmCalled).toBe(false)

        await electronApp.close()
    })
})
