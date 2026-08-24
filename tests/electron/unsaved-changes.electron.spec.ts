import { sharedElectronTest as test, expect } from '../helpers/shared-electron'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const OPENED_DOC_ID = 'opened-doc'

let tmpDir: string
let openedPath: string

test.beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'caption-editor-unsaved-'))
    openedPath = join(tmpDir, 'some-other.captions_json5')
    writeFileSync(
        openedPath,
        JSON.stringify(
            {
                metadata: { id: OPENED_DOC_ID },
                segments: [
                    { id: 'opened-seg', index: 0, startTime: 0, endTime: 1, text: 'Opened' }
                ]
            },
            null,
            2
        )
    )
})

test.afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
})

/**
 * Make the OS "Open" dialog return `openedPath` without showing anything.
 *
 * This has to be stubbed in the MAIN process. The obvious-looking renderer
 * version — `window.electronAPI.openFile = async () => [...]` — silently does
 * nothing: `electronAPI` is published through `contextBridge.exposeInMainWorld`,
 * and those objects are immutable in the renderer, so the assignment is dropped
 * and the real `dialog.showOpenDialog` still runs. These tests used to do
 * exactly that and appeared to pass only because the unsaved-changes prompt ran
 * *before* the picker, so the picker was never reached before the assertions
 * finished. Now that `openDocumentFromPaths()` prompts after the picker, that
 * same stub would pop a real native file dialog and block the run.
 */
async function stubOpenDialog(electronApp: ElectronApplication, filePath: string): Promise<void> {
    await electronApp.evaluate(async ({ dialog }, path) => {
        const g = globalThis as any
        if (!g.__origShowOpenDialog) g.__origShowOpenDialog = dialog.showOpenDialog
        dialog.showOpenDialog = (async () => ({
            canceled: false,
            filePaths: [path]
        })) as typeof dialog.showOpenDialog
    }, filePath)
}

/** Undo {@link stubOpenDialog}. The Electron app is shared across the whole
 *  worker, so leaving the stub installed would leak into every later spec. */
async function restoreOpenDialog(electronApp: ElectronApplication): Promise<void> {
    await electronApp.evaluate(async ({ dialog }) => {
        const g = globalThis as any
        if (g.__origShowOpenDialog) {
            dialog.showOpenDialog = g.__origShowOpenDialog
            delete g.__origShowOpenDialog
        }
    })
}

test.afterEach(async ({ electronApp }) => {
    await restoreOpenDialog(electronApp)
})

/** The id of the document currently in the store. */
function openDocId(page: Page): Promise<string> {
    return page.evaluate(() => (window as any).$store.document.metadata.id)
}

test.describe('Unsaved Changes Warning', () => {
    test('should warn on unsaved changes when opening another file', async ({ page, electronApp }) => {
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
        await stubOpenDialog(electronApp, openedPath)

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

        // Discarding goes on to actually open the picked file. That second half is
        // what used to be skipped: File → Open loaded the file inside FileDropZone
        // instead of routing through openDocumentFromPaths(), so it never took the
        // single-owner document claim and two windows could edit one transcript.
        await expect.poll(() => openDocId(page), { timeout: 5000 }).toBe(OPENED_DOC_ID)
    })

    test('should NOT warn if NO unsaved changes when opening another file', async ({ page, electronApp }) => {
        await stubOpenDialog(electronApp, openedPath)

        await page.evaluate(() => (window as any).handleMenuOpenFile())

        // Verify NO modal appears
        const modalVisible = await page.locator('.base-modal-overlay').isVisible()
        expect(modalVisible).toBe(false)

        // ...and the file opened anyway.
        expect(await openDocId(page)).toBe(OPENED_DOC_ID)
    })

    test('SHOULD warn when the only change is a newly attached media file', async ({ page, electronApp }) => {
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

        await stubOpenDialog(electronApp, openedPath)

        await page.evaluate(() => {
            setTimeout(() => (window as any).handleMenuOpenFile(), 0)
        })

        const modal = page.locator('.base-modal', { hasText: 'Unsaved Changes' })
        await modal.waitFor({ state: 'visible', timeout: 5000 })
        await modal.locator('button:has-text("Discard changes")').click()
        await modal.waitFor({ state: 'hidden', timeout: 5000 })
    })

    test('opening a document with attached media does NOT make it dirty', async ({ page, electronApp }) => {
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
        await stubOpenDialog(electronApp, openedPath)
        await page.evaluate(() => (window as any).handleMenuOpenFile())
        expect(await page.locator('.base-modal-overlay').isVisible()).toBe(false)
    })

    test('a file opened from the OS goes through the unsaved-changes check', async ({ page }) => {
        // Finder double-click / dock drop used to call processFilePaths() directly,
        // silently discarding whatever was open.
        await page.evaluate(() => (window as any).$store.addSegment(0, 5))
        expect(await page.evaluate(() => (window as any).$store.isDirty)).toBe(true)

        await page.evaluate((p) => {
            setTimeout(() => (window as any).handleExternalFileOpen([p]), 0)
        }, openedPath)

        const modal = page.locator('.base-modal', { hasText: 'Unsaved Changes' })
        await modal.waitFor({ state: 'visible', timeout: 5000 })
        await modal.locator('button:has-text("Cancel")').click()
        await modal.waitFor({ state: 'hidden', timeout: 5000 })

        // Canceling kept the open document intact.
        expect(await page.evaluate(() => (window as any).$store.document.segments.length)).toBe(1)
    })
})
