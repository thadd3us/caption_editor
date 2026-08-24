import { sharedElectronTest as test, expect } from '../helpers/shared-electron'

test.describe('Unsaved Changes Warning', () => {
    test('should warn on unsaved changes when opening another file', async ({ page }) => {
        // 1. Initially NOT dirty
        const initialDirty = await page.evaluate(() => (window as any).$store.isDirty)
        expect(initialDirty).toBe(false)

        // 2. Make an edit (add a segment)
        await page.evaluate(() => (window as any).$store.addSegment(0, 5))

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
    })

    test('should NOT warn if NO unsaved changes when opening another file', async ({ page }) => {
        // Mock openFile
        await page.evaluate(() => {
            (window as any).electronAPI.openFile = async () => []
        })

        await page.evaluate(() => (window as any).handleMenuOpenFile())

        // Verify NO modal appears
        const modalVisible = await page.locator('.base-modal-overlay').isVisible()
        expect(modalVisible).toBe(false)
    })

    test('SHOULD warn when the only change is a newly attached media file', async ({ page }) => {
        // Attaching media to an empty session is a real unsaved change: the media
        // path lives in the document. This used to be suppressed by a
        // `segments.length > 0` guard, so quitting here silently threw the
        // attachment away. The guard existed only to mask media auto-load
        // dirtying untouched documents, which the store no longer does.
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

        await page.evaluate(() => {
            (window as any).electronAPI.openFile = async () => []
        })

        await page.evaluate(() => {
            setTimeout(() => (window as any).handleMenuOpenFile(), 0)
        })

        const modal = page.locator('.base-modal', { hasText: 'Unsaved Changes' })
        await modal.waitFor({ state: 'visible', timeout: 5000 })
        await modal.locator('button:has-text("Discard changes")').click()
        await modal.waitFor({ state: 'hidden', timeout: 5000 })
    })

    test('opening a document with attached media does NOT make it dirty', async ({ page }) => {
        // Regression: media auto-load rewrote metadata.mediaFilePath with the same
        // path it had just read, so every document with media went dirty moments
        // after opening and quitting produced a spurious prompt.
        await page.evaluate(() => {
            const store = (window as any).$store
            const content = JSON.stringify({
                metadata: { id: 'autoload-dirty-check', mediaFilePath: '/media/does-not-matter.wav' },
                segments: [{ id: 'seg-1', index: 0, startTime: 0, endTime: 1, text: 'Hi' }]
            })
            store.loadFromFile(content, '/docs/a.captions_json5')
        })

        // Re-attaching the media the document already references (what auto-load does).
        await page.evaluate(() => {
            const store = (window as any).$store
            store.loadMediaFile('media:///media/does-not-matter.wav', store.document.metadata.mediaFilePath)
        })

        expect(await page.evaluate(() => (window as any).$store.isDirty)).toBe(false)

        // ...so no prompt when opening something else.
        await page.evaluate(() => {
            (window as any).electronAPI.openFile = async () => []
        })
        await page.evaluate(() => (window as any).handleMenuOpenFile())
        expect(await page.locator('.base-modal-overlay').isVisible()).toBe(false)
    })

    test('a file opened from the OS goes through the unsaved-changes check', async ({ page }) => {
        // Finder double-click / dock drop used to call processFilePaths() directly,
        // silently discarding whatever was open.
        await page.evaluate(() => (window as any).$store.addSegment(0, 5))
        expect(await page.evaluate(() => (window as any).$store.isDirty)).toBe(true)

        await page.evaluate(() => {
            setTimeout(() => (window as any).handleExternalFileOpen(['/tmp/some-other.captions_json5']), 0)
        })

        const modal = page.locator('.base-modal', { hasText: 'Unsaved Changes' })
        await modal.waitFor({ state: 'visible', timeout: 5000 })
        await modal.locator('button:has-text("Cancel")').click()
        await modal.waitFor({ state: 'hidden', timeout: 5000 })

        // Canceling kept the open document intact.
        expect(await page.evaluate(() => (window as any).$store.document.segments.length)).toBe(1)
    })
})
