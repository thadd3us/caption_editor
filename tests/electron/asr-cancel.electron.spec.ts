import { test, expect, _electron as electron } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test.describe('ASR Cancellation Reproduction', () => {
    // Skipped by default since it depends on local Python tooling (`uv`).
    test.skip(process.env.RUN_PY_E2E !== 'true', 'Set RUN_PY_E2E=true to enable Python-dependent Electron E2E tests')
    test('should remain responsive after cancelling ASR transcription', async () => {
        // Create a temporary directory for test files
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asr-cancel-reproduction-'))
        console.log('[Test] Created temp directory:', tmpDir)

        try {
            // Copy test audio file to temp directory
            const sourceAudioPath = path.join(__dirname, '../../test_data/full_pipeline/OSR_us_000_0010_8k.wav')
            const destAudioPath = path.join(tmpDir, 'test_audio.wav')
            fs.copyFileSync(sourceAudioPath, destAudioPath)
            console.log('[Test] Copied audio file to:', destAudioPath)

            const env = {
                ...process.env,
                NODE_ENV: 'development',
                CAPTION_EDITOR_RUN_TRANSCRIBE_FROM_CODE_TREE: '1'
            }

            // Launch Electron app
            const electronApp = await electron.launch({
                args: [path.join(__dirname, '../../dist-electron/main.cjs')],
                env,
                executablePath: process.env.ELECTRON_PATH,
            })

            const page = await electronApp.firstWindow()

            // Set the ASR model override on the window
            await page.evaluate(() => {
                (window as any).__ASR_MODEL_OVERRIDE = 'openai/whisper-tiny'
            })

            // Wait for app to be ready
            await page.waitForLoadState('domcontentloaded')
            await page.waitForTimeout(1000)

            // Load the audio file
            await page.evaluate((audioPath) => {
                const store = (window as any).$store
                const electronAPI = (window as any).electronAPI
                if (!store) throw new Error('No $store on window')
                if (!electronAPI?.fileToURL) throw new Error('electronAPI.fileToURL not available')

                return electronAPI.fileToURL(audioPath).then((urlResult: any) => {
                    if (!urlResult.success || !urlResult.url) throw new Error('Failed to convert audio path to URL')
                    store.loadMediaFile(urlResult.url, audioPath)
                })
            }, destAudioPath)

            // Wait for media to be loaded
            await page.waitForTimeout(1000)

            // Trigger ASR menu action
            await page.evaluate(() => {
                (window as any).handleMenuAsrCaption()
            })

            // Wait for ASR modal to appear
            await page.waitForSelector('.asr-modal-overlay', { timeout: 10000 })
            console.log('[Test] ASR modal appeared')

            // Wait for ASR to actually start
            await page.waitForTimeout(2000)

            // Click cancel
            console.log('[Test] Clicking cancel button')
            await page.locator('.asr-button-cancel').click()

            // Wait for modal to disappear
            await page.waitForSelector('.asr-modal-overlay', { state: 'hidden', timeout: 5000 })
            console.log('[Test] ASR modal closed')

            // VERIFY APP IS STILL RESPONSIVE
            console.log('[Test] Verifying app responsiveness')
            const appState = await page.evaluate(() => {
                const store = (window as any).$store
                return {
                    isElectron: !!(window as any).electronAPI,
                    hasMediaPath: !!store.mediaPath
                }
            })
            expect(appState.isElectron).toBe(true)
            expect(appState.hasMediaPath).toBe(true)

            // Clear dirty flag so we can close without confirmation
            await page.evaluate(() => {
                const store = (window as any).$store
                store?.setIsDirty?.(false)
            })

            await electronApp.close()
            console.log('[Test] App closed successfully')
        } finally {
            // Clean up temp directory
            try {
                fs.rmSync(tmpDir, { recursive: true, force: true })
                console.log('[Test] Cleaned up temp directory')
            } catch (err) {
                console.error('[Test] Failed to clean up temp directory:', err)
            }
        }
    })
})
