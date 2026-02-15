import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import { getElectronMainPath } from '../helpers/project-root'

test.describe('Drag-and-Drop IPC Integration', () => {
    let electronApp: ElectronApplication
    let window: Page

    test.beforeEach(async () => {
        electronApp = await electron.launch({
            args: [getElectronMainPath(), '--no-sandbox'],
            env: {
                ...process.env,
                NODE_ENV: 'test'
            }
        })

        window = await electronApp.firstWindow()
        await window.waitForLoadState('domcontentloaded')
        // Wait for App to be mounted and $store to be available
        await window.waitForFunction(() => (window as any).$store !== undefined)
    })

    test.afterEach(async () => {
        if (electronApp) {
            await electronApp.close().catch(() => { })
        }
    })

    test('should process files-dropped IPC message correctly', async () => {
        const testFilePath = '/path/to/fake.captions.json'

        // 1. Mock processDroppedFiles in the main process to return a fake result
        // so we don't actually hit the filesystem in this test
        await electronApp.evaluate(({ ipcMain }) => {
            // Remove existing handler if any
            ipcMain.removeHandler('file:processDroppedFiles')
            ipcMain.handle('file:processDroppedFiles', async () => {
                return [{
                    type: 'captions_json',
                    filePath: '/path/to/fake.captions.json',
                    fileName: 'fake.captions.json',
                    content: JSON.stringify({
                        metadata: { id: 'drag-drop-integration' },
                        segments: [{ id: 'cue1', startTime: 1, endTime: 2, text: 'Integration test successful' }]
                    }, null, 2)
                }]
            })
        })

        // 2. Send the 'files-dropped' message from the MAIN process
        // This tests the preload.ts listener and App.vue listener integration
        await electronApp.evaluate(({ BrowserWindow }, filePaths) => {
            const win = BrowserWindow.getAllWindows()[0]
            win.webContents.send('files-dropped', filePaths)
        }, [testFilePath])

        // 3. Verify that the store was updated
        // We wait for the segment to appear which implies processFilePaths ran successfully
        await window.waitForFunction(() => {
            const store = (window as any).$store
            return store && store.document.segments.length > 0
        }, { timeout: 5000 })

        const text = await window.evaluate(() => {
            const store = (window as any).$store
            return store.document.segments[0].text
        })

        expect(text).toBe('Integration test successful')
    })
})
