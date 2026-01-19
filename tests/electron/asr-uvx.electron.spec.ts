import { test, expect, _electron as electron } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { fileURLToPath } from 'url'
import { getProjectRoot, getElectronMainPath } from '../helpers/project-root'
import { enableConsoleCapture } from '../helpers/console'
import { launchElectron } from '../helpers/electron-launch'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test.describe('ASR uvx Integration @expensive', () => {
    // Expensive test - downloads from GitHub and runs ML models
    // Skip with SKIP_EXPENSIVE_TESTS=true
    test('should run ASR transcription via uvx (GitHub path) @expensive', async () => {
        test.setTimeout(300000) // 5 minutes because it downloads and runs a model
        // Create a temporary directory for test files
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asr-uvx-test-'))
        console.log('[Test] Created temp directory:', tmpDir)

        try {
            // Copy test audio file to temp directory
            const projectRoot = getProjectRoot()
            const sourceAudioPath = path.join(projectRoot, 'test_data/full_pipeline/OSR_us_000_0010_8k.wav')
            const destAudioPath = path.join(tmpDir, 'test_audio.wav')
            fs.copyFileSync(sourceAudioPath, destAudioPath)
            console.log('[Test] Copied audio file to:', destAudioPath)

            // Set environment to trigger uvx path
            const env = {
                ...process.env,
                NODE_ENV: 'production', // Avoid 'development' branch
                CAPTION_EDITOR_RUN_TRANSCRIBE_FROM_CODE_TREE: '0',
                DISPLAY: process.env.DISPLAY || ':99'
            }

            // Launch Electron app using common helper
            const electronApp = await launchElectron({
                env
            })

            const page = await electronApp.firstWindow()
            enableConsoleCapture(page)

            // Set the ASR model override on the window to use whisper-tiny
            await page.evaluate(() => {
                (window as any).__ASR_MODEL_OVERRIDE = 'openai/whisper-tiny'
            })

            // Wait for app to be ready
            await page.waitForLoadState('domcontentloaded')
            await page.waitForTimeout(1000)

            // Load the audio file via the store
            await page.evaluate((audioPath) => {
                const store = (window as any).$store
                if (!store) throw new Error('$store not found')
                // We use the absolute path, and we expect the store to handle the media:// conversion
                store.loadMediaFile(`media://local${audioPath}`, audioPath)
            }, destAudioPath)

            // Verify media is loaded
            const mediaLoaded = await page.evaluate(() => {
                const store = (window as any).$store
                return !!store.mediaPath
            })
            expect(mediaLoaded).toBe(true)
            console.log('[Test] Media file loaded')

            // Trigger ASR via the handleMenuAsrCaption exposed by App.vue
            await page.evaluate(() => {
                // App.vue exposes handleMenuAsrCaption for testing
                const handleMenuAsrCaption = (window as any).handleMenuAsrCaption
                if (handleMenuAsrCaption) {
                    handleMenuAsrCaption()
                } else {
                    throw new Error('handleMenuAsrCaption not exposed on window')
                }
            })

            // Wait for ASR modal to appear
            await page.waitForSelector('.asr-modal-overlay', { timeout: 5000 })
            console.log('[Test] ASR modal appeared')

            // Wait for ASR to complete
            // uvx may take some time to set up the environment
            const maxWaitTime = 300000 // 5 minutes
            const startTime = Date.now()

            while (Date.now() - startTime < maxWaitTime) {
                const modalVisible = await page.locator('.asr-modal-overlay').isVisible().catch(() => false)

                if (!modalVisible) {
                    console.log('[Test] ASR modal closed (success)')
                    break
                }

                // Check for error state
                const errorText = await page.locator('.asr-status-text').textContent().catch(() => '')
                if (errorText && errorText.toLowerCase().includes('failed')) {
                    const terminalOutput = await page.locator('.asr-terminal pre').textContent().catch(() => 'No terminal output')
                    console.error('[Test] ASR failed. Terminal output:', terminalOutput)
                    throw new Error(`ASR process failed: ${errorText}`)
                }

                await page.waitForTimeout(5000)
            }

            // Verify modal is closed
            const finalModalVisible = await page.locator('.asr-modal-overlay').isVisible().catch(() => false)
            expect(finalModalVisible).toBe(false)
            console.log('[Test] ASR completed successfully')

            // Verify segments were loaded into the store
            const segments = await page.evaluate(() => {
                const store = (window as any).$store
                return store.document.segments
            })

            expect(segments.length).toBeGreaterThan(0)
            console.log('[Test] Loaded', segments.length, 'segments')

            // Verify first segment content
            const firstSegment = segments[0]
            expect(firstSegment.text.length).toBeGreaterThan(0)
            console.log('[Test] First segment text:', firstSegment.text)

            // Basic check for expected content in the OSR audio
            // Usually starts with something like "The birch canoe slid..."
            expect(firstSegment.text.toLowerCase()).toContain('birch')

            await electronApp.close()
        } finally {
            // Clean up temp directory
            try {
                if (fs.existsSync(tmpDir)) {
                    fs.rmSync(tmpDir, { recursive: true, force: true })
                    console.log('[Test] Cleaned up temp directory')
                }
            } catch (err) {
                console.error('[Test] Failed to clean up temp directory:', err)
            }
        }
    })
})
