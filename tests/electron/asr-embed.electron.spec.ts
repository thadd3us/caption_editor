import { test, expect, _electron as electron } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { fileURLToPath } from 'url'
import { getProjectRoot, getElectronMainPath } from '../helpers/project-root'
import { enableConsoleCapture } from '../helpers/console'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test.describe('Speaker Embedding Integration', () => {
    test('should compute speaker embeddings via menu item', async () => {
        // Create a temporary directory for test files
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asr-embed-test-'))
        console.log('[Test] Created temp directory:', tmpDir)

        try {
            const projectRoot = getProjectRoot()

            // 1. Copy test audio file and VTT file to temp directory
            const sourceAudioPath = path.join(projectRoot, 'test_data/full_pipeline/OSR_us_000_0010_8k.wav')
            const sourceVttPath = path.join(projectRoot, 'test_data/full_pipeline/1_after_transcribe.vtt')

            const destAudioPath = path.join(tmpDir, 'test_audio.wav')
            const destVttPath = path.join(tmpDir, 'test_audio.vtt')

            fs.copyFileSync(sourceAudioPath, destAudioPath)
            fs.copyFileSync(sourceVttPath, destVttPath)

            console.log('[Test] Copied audio file to:', destAudioPath)
            console.log('[Test] Copied VTT file to:', destVttPath)

            // 2. Set environment to trigger uvx path if in production
            // But for tests usually we might want to run in dev mode or prod mode
            // Let's stick to CAPTION_EDITOR_RUN_TRANSCRIBE_FROM_CODE_TREE=1 for faster local testing
            // unless we specifically want to test the download.
            const env = {
                ...process.env,
                CAPTION_EDITOR_RUN_TRANSCRIBE_FROM_CODE_TREE: '1',
                CAPTION_EDITOR_CODE_TREE_ROOT: projectRoot,
                DISPLAY: process.env.DISPLAY || ':99'
            }

            // 3. Launch Electron app
            const electronApp = await electron.launch({
                args: [getElectronMainPath()],
                env,
                executablePath: process.env.ELECTRON_PATH,
            })

            const page = await electronApp.firstWindow()
            enableConsoleCapture(page)

            // Wait for app to be ready
            await page.waitForLoadState('domcontentloaded')
            // Wait for Vue app to mount and store to be available
            await page.waitForFunction(() => (window as any).$store || (window as any).store, { timeout: 10000 })

            await page.evaluate(() => {
                console.log('[Test] electronAPI keys:', Object.keys((window as any).electronAPI || {}))
                console.log('[Test] electronAPI.asr keys:', Object.keys((window as any).electronAPI?.asr || {}))
            })

            // 4. Load the VTT file
            console.log('[Test] Loading VTT file:', destVttPath)
            await page.evaluate(async (vttPath) => {
                const store = (window as any).$store || (window as any).store
                if (!store) throw new Error('Store not found on window')

                const result = await (window as any).electronAPI.readFile(vttPath)
                if (result.success && result.content) {
                    store.loadFromFile(result.content, vttPath)
                } else {
                    throw new Error('Failed to load VTT: ' + result.error)
                }
            }, destVttPath)

            // 5. Load the media file
            console.log('[Test] Loading media file:', destAudioPath)
            await page.evaluate(async (audioPath) => {
                const store = (window as any).$store || (window as any).store
                if (!store) throw new Error('Store not found on window')

                const urlResult = await (window as any).electronAPI.fileToURL(audioPath)
                if (urlResult.success && urlResult.url) {
                    store.loadMediaFile(urlResult.url, audioPath)
                } else {
                    throw new Error('Failed to get media URL: ' + urlResult.error)
                }
            }, destAudioPath)

            // 6. Verify segments are loaded
            const segmentCount = await page.evaluate(() => {
                const store = (window as any).$store || (window as any).store
                return store.document.segments.length
            })
            console.log('[Test] Segments loaded:', segmentCount)
            expect(segmentCount).toBeGreaterThan(0)

            // 7. Trigger the embedding process via the handleMenuAsrEmbed exposed by App.vue
            console.log('[Test] Triggering speaker embedding...')
            await page.evaluate(() => {
                const handleMenuAsrEmbed = (window as any).handleMenuAsrEmbed
                if (handleMenuAsrEmbed) {
                    handleMenuAsrEmbed()
                } else {
                    throw new Error('handleMenuAsrEmbed not exposed on window')
                }
            })

            // 8. Wait for the ASR modal to appear and then disappear (indicating completion)
            const modal = page.locator('.asr-modal-overlay')
            await expect(modal).toBeVisible({ timeout: 20000 })
            console.log('[Test] ASR Modal visible, waiting for completion...')

            // The process can take a while (downloading model, computing)
            // Increase timeout for model loading
            await expect(modal).not.toBeVisible({ timeout: 180000 })
            console.log('[Test] ASR Modal closed.')

            // 9. Verify that embeddings were added
            // We check if the store has embeddings now
            const embeddingCount = await page.evaluate(() => {
                const store = (window as any).$store || (window as any).store
                return store.document.embeddings?.length || 0
            })

            console.log('[Test] Count of embeddings added:', embeddingCount)

            if (embeddingCount === 0) {
                const terminalOutput = await page.locator('.asr-terminal pre').textContent().catch(() => 'No terminal output found in modal')
                console.log('[Test] Terminal output from modal:\n', terminalOutput)
            }

            expect(embeddingCount).toBeGreaterThan(0)
            expect(embeddingCount).toBe(segmentCount)

            // Close app
            await electronApp.close()

        } finally {
            // Clean up temp directory
            // fs.rmSync(tmpDir, { recursive: true, force: true })
        }
    })
})
