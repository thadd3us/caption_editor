import { test, expect, _electron as electron } from '@playwright/test'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { getElectronMainPath } from '../helpers/project-root'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test.describe('Unsaved Changes Warning', () => {
    test('should warn on unsaved changes when opening another file', async () => {
        const electronApp = await electron.launch({
            args: [getElectronMainPath(), '--no-sandbox'],
            env: {
                ...process.env,
                NODE_ENV: 'test'
            }
        })

        const page = await electronApp.firstWindow()
        await page.waitForFunction(() => (window as any).$store !== undefined, { timeout: 10000 })

        // 1. Initially NOT dirty
        const initialDirty = await page.evaluate(() => (window as any).$store.isDirty)
        expect(initialDirty).toBe(false)

        // 2. Make an edit (add a cue)
        await page.evaluate(() => (window as any).$store.addCue(0, 5))

        // 3. Now it SHOULD be dirty and have segments
        const state = await page.evaluate(() => {
            const store = (window as any).$store
            return {
                isDirty: store.isDirty,
                segmentCount: store.document.segments.length
            }
        })
        expect(state.isDirty).toBe(true)
        expect(state.segmentCount).toBe(1)

        // 4. Try to open a file (this should trigger handleMenuOpenFile)
        let confirmCalled = false
        page.on('dialog', async dialog => {
            if (dialog.type() === 'confirm' && dialog.message().includes('unsaved changes')) {
                confirmCalled = true
                await dialog.accept() // Discard changes
            }
        })

        // Mock openFile to avoid hanging on native dialogs
        await page.evaluate(() => {
            (window as any).electronAPI.openFile = async () => []
        })

        // Trigger handleMenuOpenFile directly
        await page.evaluate(() => (window as any).handleMenuOpenFile())

        expect(confirmCalled).toBe(true)

        // Clean up: Disable dirty bit so we can close without beforeunload prompt
        await page.evaluate(() => (window as any).$store.setIsDirty(false))
        await electronApp.close()
    })

    test('should NOT warn if NO unsaved changes when opening another file', async () => {
        const electronApp = await electron.launch({
            args: [getElectronMainPath(), '--no-sandbox'],
            env: {
                ...process.env,
                NODE_ENV: 'test'
            }
        })

        const page = await electronApp.firstWindow()
        await page.waitForFunction(() => (window as any).$store !== undefined, { timeout: 10000 })

        // Mock openFile
        await page.evaluate(() => {
            (window as any).electronAPI.openFile = async () => []
        })

        let confirmCalled = false
        page.on('dialog', async () => {
            confirmCalled = true
        })

        await page.evaluate(() => (window as any).handleMenuOpenFile())

        expect(confirmCalled).toBe(false)

        await electronApp.close()
    })

    test('should NOT warn if dirty but NO segments (media only)', async () => {
        const electronApp = await electron.launch({
            args: [getElectronMainPath(), '--no-sandbox'],
            env: {
                ...process.env,
                NODE_ENV: 'test'
            }
        })

        const page = await electronApp.firstWindow()
        await page.waitForFunction(() => (window as any).$store !== undefined, { timeout: 10000 })

        // 1. Load a media file - this makes the store dirty but document.segments remains empty
        await page.evaluate(async () => {
            const store = (window as any).$store
            // Mock a media file load
            store.loadMediaFile('media://path/to/video.mp4', '/path/to/video.mp4')
        })

        const state = await page.evaluate(() => {
            const store = (window as any).$store
            return {
                isDirty: store.isDirty,
                segmentCount: store.document.segments.length
            }
        })

        // Sanity check: it is dirty but has no segments
        expect(state.isDirty).toBe(true)
        expect(state.segmentCount).toBe(0)

        // 2. Try to open a file - should NOT prompt because there are no segments to lose
        let confirmCalled = false
        page.on('dialog', async () => {
            confirmCalled = true
        })

        // Mock openFile
        await page.evaluate(() => {
            (window as any).electronAPI.openFile = async () => []
        })

        await page.evaluate(() => (window as any).handleMenuOpenFile())

        expect(confirmCalled).toBe(false)

        // Clean up: Disable dirty bit so we can close without beforeunload prompt
        await page.evaluate(() => (window as any).$store.setIsDirty(false))
        await electronApp.close()
    })
})
