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
        // Mock openFile to avoid hanging
        await page.evaluate(() => {
            (window as any).electronAPI.openFile = async () => []
        })

        // Trigger handleMenuOpenFile WITHOUT awaiting it so we can interact with the modal
        await page.evaluate(() => {
            setTimeout(() => (window as any).handleMenuOpenFile(), 0)
        })

        // Wait for custom modal
        const modal = page.locator('.base-modal', { hasText: 'Unsaved Changes' })
        await modal.waitFor({ state: 'visible', timeout: 5000 })

        // Discard changes
        await modal.locator('button:has-text("Discard changes")').click()
        await modal.waitFor({ state: 'hidden', timeout: 5000 })

        // Clean up
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

        await page.evaluate(() => (window as any).handleMenuOpenFile())

        // Verify NO modal appears
        const modalVisible = await page.locator('.base-modal-overlay').isVisible()
        expect(modalVisible).toBe(false)

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

        // 1. Load a media file
        await page.evaluate(async () => {
            const store = (window as any).$store
            store.loadMediaFile('media://path/to/video.mp4', '/path/to/video.mp4')
        })

        const state = await page.evaluate(() => {
            const store = (window as any).$store
            return {
                isDirty: store.isDirty,
                segmentCount: store.document.segments.length
            }
        })

        expect(state.isDirty).toBe(true)
        expect(state.segmentCount).toBe(0)

        // 2. Try to open a file - should NOT prompt
        // Mock openFile
        await page.evaluate(() => {
            (window as any).electronAPI.openFile = async () => []
        })

        await page.evaluate(() => (window as any).handleMenuOpenFile())

        const modalVisible = await page.locator('.base-modal-overlay').isVisible()
        expect(modalVisible).toBe(false)

        await page.evaluate(() => (window as any).$store.setIsDirty(false))
        await electronApp.close()
    })
})
