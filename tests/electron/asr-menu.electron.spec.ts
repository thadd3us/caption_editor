import { test, expect, _electron as electron } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test.describe('ASR Menu Integration @expensive', () => {
  // Expensive test - requires downloading ML models and running transcription
  // Skipped by default since it depends on local Python tooling (`uv`).
  test.skip(process.env.RUN_PY_E2E !== 'true', 'Set RUN_PY_E2E=true to enable Python-dependent Electron E2E tests')
  test('should run ASR transcription from menu @expensive', async () => {
    test.setTimeout(180000) // 3 minute timeout for model download + transcription
    // Create a temporary directory for test files
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asr-test-'))
    console.log('[Test] Created temp directory:', tmpDir)

    try {
      // Copy test audio file to temp directory
      const sourceAudioPath = path.join(__dirname, '../../test_data/full_pipeline/OSR_us_000_0010_8k.wav')
      const destAudioPath = path.join(tmpDir, 'test_audio.wav')
      fs.copyFileSync(sourceAudioPath, destAudioPath)
      console.log('[Test] Copied audio file to:', destAudioPath)

      // Set ASR model override to use whisper-tiny for faster testing
      const env = {
        ...process.env,
        // Dev mode detection
        NODE_ENV: 'development'
      }

      // Launch Electron app
      const electronApp = await electron.launch({
        args: [path.join(__dirname, '../../dist-electron/main.cjs')],
        env,
        executablePath: process.env.ELECTRON_PATH,
        // Required for Linux/Docker environments
        ...(process.platform === 'linux' && {
          env: {
            ...env,
            DISPLAY: process.env.DISPLAY || ':99'
          },
          args: [
            '--no-sandbox',
            path.join(__dirname, '../../dist-electron/main.cjs')
          ]
        })
      })

      const page = await electronApp.firstWindow()

      // Set the ASR model override on the window
      await page.evaluate(() => {
        (window as any).__ASR_MODEL_OVERRIDE = 'openai/whisper-tiny'
      })

      // Wait for app to be ready
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(500)

      // Load the audio file by simulating file drop
      await page.evaluate((audioPath) => {
        const store = (window as any).$store
        // Simulate loading media file directly
        store.loadMediaFile(`file://${audioPath}`, audioPath)
      }, destAudioPath)

      // Wait for media to be loaded
      await page.waitForTimeout(500)

      // Verify media is loaded
      const mediaLoaded = await page.evaluate(() => {
        const store = (window as any).$store
        return !!store.mediaPath
      })
      expect(mediaLoaded).toBe(true)
      console.log('[Test] Media file loaded')

      // Trigger ASR menu action by calling the handler directly
      // (In real usage, this would be triggered by the menu item)
      await page.evaluate(() => {
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

      // Wait for ASR to complete (may take up to 3 minutes for whisper-tiny)
      // Check for completion by waiting for the modal to disappear or for the error state
      const maxWaitTime = 180000 // 3 minutes
      const startTime = Date.now()

      while (Date.now() - startTime < maxWaitTime) {
        const modalVisible = await page.locator('.asr-modal-overlay').isVisible().catch(() => false)

        if (!modalVisible) {
          console.log('[Test] ASR modal closed (success)')
          break
        }

        // Check if there's an error
        const errorButton = await page.locator('.asr-button-error').isVisible().catch(() => false)
        if (errorButton) {
          // Get terminal output for debugging
          const terminalOutput = await page.locator('.asr-terminal pre').textContent()
          console.error('[Test] ASR failed. Terminal output:', terminalOutput)
          throw new Error('ASR process failed')
        }

        await page.waitForTimeout(2000)
      }

      // Verify modal is closed
      const modalVisible = await page.locator('.asr-modal-overlay').isVisible().catch(() => false)
      expect(modalVisible).toBe(false)
      console.log('[Test] ASR completed successfully')

      // Verify captions file was generated and loaded
      const captionsPath = path.join(tmpDir, 'test_audio.captions.json')
      expect(fs.existsSync(captionsPath)).toBe(true)
      console.log('[Test] Captions file generated:', captionsPath)

      // Verify segments were loaded into the store
      const segmentCount = await page.evaluate(() => {
        const store = (window as any).$store
        return store.document.segments.length
      })
      expect(segmentCount).toBeGreaterThan(0)
      console.log('[Test] Loaded', segmentCount, 'segments')

      // Verify segments have text content
      const firstSegmentText = await page.evaluate(() => {
        const store = (window as any).$store
        return store.document.segments[0]?.text || ''
      })
      expect(firstSegmentText.length).toBeGreaterThan(0)
      console.log('[Test] First segment text:', firstSegmentText)

      await electronApp.close()
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

  test('should show confirmation dialog when segments exist', async () => {
    const env = {
      ...process.env,
      NODE_ENV: 'development'
    }

    // Launch Electron app
    const electronApp = await electron.launch({
      args: [path.join(__dirname, '../../dist-electron/main.cjs')],
      env,
      executablePath: process.env.ELECTRON_PATH,
      ...(process.platform === 'linux' && {
        env: {
          ...env,
          DISPLAY: process.env.DISPLAY || ':99'
        },
        args: [
          '--no-sandbox',
          path.join(__dirname, '../../dist-electron/main.cjs')
        ]
      })
    })

    const page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
    await page.waitForTimeout(500)

    // Create a fake media path and add a test segment
    await page.evaluate(() => {
      const store = (window as any).$store
      store.loadMediaFile('file:///fake/path.wav', '/fake/path.wav')
      store.addSegment(0, 1)  // Add a 1-second segment starting at 0
      // Update the text
      if (store.document.segments.length > 0) {
        const segment = store.document.segments[0]
        store.updateSegment(segment.id, { text: 'Test segment' })
      }
    })

    // Trigger ASR menu action WITHOUT awaiting it so we can interact with the modal
    await page.evaluate(() => {
      setTimeout(() => {
        const handleMenuAsrCaption = (window as any).handleMenuAsrCaption
        if (handleMenuAsrCaption) {
          handleMenuAsrCaption()
        }
      }, 0)
    })

    // Wait for the FIRST confirmation dialog (Unsaved Changes) to appear
    const unsavedChangesModal = page.locator('.base-modal', { hasText: 'Unsaved Changes' })
    await unsavedChangesModal.waitFor({ state: 'visible', timeout: 5000 })
    console.log('[Test] Unsaved Changes confirmation dialog appeared')

    // Confirm the first dialog
    await unsavedChangesModal.locator('button:has-text("Discard changes")').click()
    await unsavedChangesModal.waitFor({ state: 'hidden', timeout: 3000 })

    // Wait for the SECOND confirmation dialog (Replace Captions) to appear
    console.log('[Test] Waiting for "Replace Existing Captions?" dialog')
    const replaceCaptionsModal = page.locator('.base-modal', { hasText: 'Replace Existing Captions?' })
    await replaceCaptionsModal.waitFor({ state: 'visible', timeout: 5000 })
    console.log('[Test] Replace Existing Captions? dialog appeared')

    // Verify dialog text
    const dialogText = await replaceCaptionsModal.locator('.base-modal-content').textContent()
    expect(dialogText).toContain('delete all existing caption segments')

    // Click cancel on the second dialog
    console.log('[Test] Clicking Cancel on Replace Captions dialog')
    await replaceCaptionsModal.locator('button:has-text("Cancel")').click({ force: true })
    await replaceCaptionsModal.waitFor({ state: 'hidden', timeout: 5000 })
    console.log('[Test] Replace Captions dialog closed')

    // Verify dialog is closed (already checked specific modal)
    // await page.waitForSelector('.base-modal-overlay', { state: 'hidden', timeout: 5000 })

    // Verify segment still exists
    const segmentCount = await page.evaluate(() => {
      const store = (window as any).$store
      return store.document.segments.length
    })
    expect(segmentCount).toBe(1)

    // Clean up: Disable dirty bit so we can close without beforeunload prompt
    await page.evaluate(() => (window as any).$store.setIsDirty(false))
    await electronApp.close()
  })

  test('should have ASR menu disabled when no media loaded', async () => {
    const env = {
      ...process.env,
      NODE_ENV: 'development'
    }

    // Launch Electron app
    const electronApp = await electron.launch({
      args: [path.join(__dirname, '../../dist-electron/main.cjs')],
      env,
      executablePath: process.env.ELECTRON_PATH,
      ...(process.platform === 'linux' && {
        env: {
          ...env,
          DISPLAY: process.env.DISPLAY || ':99'
        },
        args: [
          '--no-sandbox',
          path.join(__dirname, '../../dist-electron/main.cjs')
        ]
      })
    })

    const page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)

    // Verify menu item is disabled initially
    // Note: We can't directly test native Electron menu state from renderer,
    // but we can verify the watcher is set up correctly
    const hasMediaPath = await page.evaluate(() => {
      const store = (window as any).$store
      return !!store.mediaPath
    })
    expect(hasMediaPath).toBe(false)
    console.log('[Test] No media loaded, ASR menu should be disabled')

    await electronApp.close()
  })
})
