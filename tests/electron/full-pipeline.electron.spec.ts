import { test, expect, _electron as electron } from '@playwright/test'
import { ElectronApplication, Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { enableConsoleCapture } from '../helpers/console'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Full E2E Pipeline Test
 *
 * This test can run in two modes:
 * 1. FAST MODE (default): Uses pre-generated intermediate files from test_data/full_pipeline/
 * 2. FULL E2E MODE: Set FULL_E2E=1 to regenerate all intermediate files from scratch
 *
 * Pipeline stages:
 * - Stage 1: Transcribe audio with transcribe.py -> produces 1_after_transcribe.vtt
 * - Stage 2: Add speaker embeddings with embed.py -> produces 2_after_embed.vtt
 * - Stage 3: Load in UI, modify rating and speaker -> produces 3_after_ui_edit.vtt
 *
 * Each stage's output is checked in, allowing fast iteration on later stages.
 */

test.describe('Full E2E Pipeline', () => {
  const PIPELINE_DIR = path.join(process.cwd(), 'test_data/full_pipeline')
  const FULL_E2E = process.env.FULL_E2E === '1'

  test('should transcribe audio, add embeddings, load in UI, modify, and save', async () => {
    test.setTimeout(30000) // Extend timeout for this E2E test
    let electronApp: ElectronApplication
    let window: Page

    // Ensure pipeline directory exists
    fs.mkdirSync(PIPELINE_DIR, { recursive: true })

    try {
      // ============================================================
      // STAGE 1: Transcribe audio with ASR
      // ============================================================
      const srcAudio = path.join(process.cwd(), 'test_data/OSR_us_000_0010_8k.wav')
      const stage1Output = path.join(PIPELINE_DIR, '1_after_transcribe.vtt')

      if (FULL_E2E || !fs.existsSync(stage1Output)) {
        console.log('\n=== STAGE 1: Running transcribe.py ===')

        // Copy audio to pipeline directory for transcribe.py
        const pipelineAudio = path.join(PIPELINE_DIR, 'OSR_us_000_0010_8k.wav')
        if (!fs.existsSync(pipelineAudio)) {
          fs.copyFileSync(srcAudio, pipelineAudio)
        }

        const transcribeCmd = `cd transcribe && uv run python transcribe.py "${pipelineAudio}"`
        execSync(transcribeCmd, { stdio: 'inherit' })

        // Move the output to stage1Output
        const generatedVtt = path.join(PIPELINE_DIR, 'OSR_us_000_0010_8k.vtt')
        if (fs.existsSync(generatedVtt)) {
          fs.copyFileSync(generatedVtt, stage1Output)
          fs.unlinkSync(generatedVtt)
        }

        expect(fs.existsSync(stage1Output)).toBe(true)
        console.log(`✓ Stage 1 complete: ${stage1Output}`)
      } else {
        console.log('\n=== STAGE 1: Using cached transcription ===')
        console.log(`Using existing: ${stage1Output}`)
      }

      // Verify stage 1 output has cues
      const stage1Content = fs.readFileSync(stage1Output, 'utf-8')
      expect(stage1Content).toContain('WEBVTT')
      expect(stage1Content).toContain('-->') // At least one cue

      // ============================================================
      // STAGE 2: Add speaker embeddings
      // ============================================================
      const stage2Output = path.join(PIPELINE_DIR, '2_after_embed.vtt')

      if (FULL_E2E || !fs.existsSync(stage2Output)) {
        console.log('\n=== STAGE 2: Running embed.py ===')

        // Check if HF_TOKEN is available
        const hasToken = process.env.HF_TOKEN && process.env.HF_TOKEN.length > 0
        if (!hasToken) {
          console.log('⚠️  HF_TOKEN not available, skipping embed.py')
          console.log('Copying stage 1 output to stage 2 (no embeddings added)')
          fs.copyFileSync(stage1Output, stage2Output)
        } else {
          // Copy stage 1 output to stage 2 location for embed.py to modify
          fs.copyFileSync(stage1Output, stage2Output)

          const embedCmd = `cd transcribe && HF_TOKEN=${process.env.HF_TOKEN} uv run python embed.py "${stage2Output}"`
          execSync(embedCmd, { stdio: 'inherit' })
          console.log(`✓ Stage 2 complete: ${stage2Output}`)
        }
      } else {
        console.log('\n=== STAGE 2: Using cached embeddings ===')
        console.log(`Using existing: ${stage2Output}`)
      }

      // Verify stage 2 output
      const stage2Content = fs.readFileSync(stage2Output, 'utf-8')
      const hasEmbeddings = stage2Content.includes('CAPTION_EDITOR:SegmentSpeakerEmbedding')
      if (process.env.HF_TOKEN) {
        console.log(`Embeddings present: ${hasEmbeddings}`)
      }

      // ============================================================
      // STAGE 3: Load in UI, modify rating and speaker label
      // ============================================================
      console.log('\n=== STAGE 3: UI interaction ===')

      // Copy stage 2 output to a working file for UI to modify
      const stage3Working = path.join(PIPELINE_DIR, '3_working.vtt')
      fs.copyFileSync(stage2Output, stage3Working)

      // Launch Electron app with the working file
      console.log('Launching Electron app...')
      electronApp = await electron.launch({
        args: [
          path.join(process.cwd(), 'dist-electron/main.cjs'),
          '--no-sandbox',
          stage3Working
        ],
        env: {
          ...process.env,
          NODE_ENV: 'test',
          DISPLAY: process.env.DISPLAY || ':99'
        }
      })

      window = await electronApp.firstWindow()
      await window.waitForLoadState('domcontentloaded')
      enableConsoleCapture(window)

      // Wait for cues to load
      await window.waitForFunction(
        () => {
          const store = (window as any).$store
          return store && store.document && store.document.cues && store.document.cues.length > 0
        },
        { timeout: 5000 }
      )

      // Verify we have cues loaded
      const storeState = await window.evaluate(() => {
        const store = (window as any).$store
        return {
          cueCount: store?.document?.cues?.length || 0,
          filePath: store?.document?.filePath
        }
      })

      expect(storeState.cueCount).toBeGreaterThan(0)
      console.log(`Loaded ${storeState.cueCount} cues in the UI`)

      // Wait for AG Grid to render
      await window.waitForSelector('.ag-row', { timeout: 5000 })

      // Modify rating and speaker name directly via store
      await window.evaluate(() => {
        const store = (window as any).$store
        const firstCue = store.document.cues[0]
        // Update both rating and speaker name in one call
        store.updateCue(firstCue.id, { rating: 3, speakerName: 'TestSpeaker' })
      })
      await window.waitForTimeout(300)
      console.log('✓ Set rating to 3 stars')
      console.log('✓ Changed speaker name to "TestSpeaker"')

      // Save the file (Ctrl+S / Cmd+S)
      const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
      await window.keyboard.press(`${modifier}+KeyS`)
      await window.waitForTimeout(500)
      console.log('✓ Saved file')

      // Copy the saved working file to stage 3 output
      const stage3Output = path.join(PIPELINE_DIR, '3_after_ui_edit.vtt')
      fs.copyFileSync(stage3Working, stage3Output)
      console.log(`✓ Stage 3 complete: ${stage3Output}`)

      // Close the app
      await electronApp.close()

      // ============================================================
      // VERIFICATION: Check that all edits persisted correctly
      // ============================================================
      console.log('\n=== VERIFICATION ===')

      const stage3Content = fs.readFileSync(stage3Output, 'utf-8')

      // 1. Verify speaker embeddings are preserved (if they exist in stage 2)
      if (hasEmbeddings) {
        const embeddingsPreserved = stage3Content.includes('CAPTION_EDITOR:SegmentSpeakerEmbedding')
        expect(embeddingsPreserved).toBe(true)
        console.log('✓ Speaker embeddings preserved after UI edit')
      }

      // 2. Verify speaker name was updated
      expect(stage3Content).toContain('TestSpeaker')
      console.log('✓ Updated speaker name found in saved file')

      // 3. Verify rating was updated
      const ratingPattern = /"rating"\s*:\s*3/
      expect(ratingPattern.test(stage3Content)).toBe(true)
      console.log('✓ Updated rating found in saved file')

      console.log('\n🎉 Full E2E pipeline test completed successfully!')

    } finally {
      // Clean up working file
      const stage3Working = path.join(PIPELINE_DIR, '3_working.vtt')
      if (fs.existsSync(stage3Working)) {
        fs.unlinkSync(stage3Working)
      }
    }
  })
})
