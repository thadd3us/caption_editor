import { test, expect, _electron as electron } from '@playwright/test'
import { ElectronApplication, Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { enableConsoleCapture } from '../helpers/console'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Full E2E Pipeline Test
 *
 * This test can run in two modes:
 * 1. FAST MODE (default): Uses pre-generated golden files from test_data/full_pipeline/
 *    - All outputs go to a temporary directory (not checked in)
 *    - Golden files are read-only, used as cached inputs
 * 2. FULL E2E MODE: Set FULL_E2E=1 to regenerate golden files from scratch
 *    - Runs all pipeline stages (transcribe, embed, UI)
 *    - Copies outputs to test_data/full_pipeline/ to update golden files
 *
 * Pipeline stages:
 * - Stage 1: Transcribe audio with transcribe.py -> produces 1_after_transcribe.vtt
 * - Stage 2: Add speaker embeddings with embed.py -> produces 2_after_embed.vtt
 * - Stage 3: Load in UI, modify rating and speaker -> produces 3_after_ui_edit.vtt
 *
 * Each stage's output is checked in as a golden file, allowing fast iteration on later stages.
 */

test.describe('Full E2E Pipeline', () => {
  const GOLDEN_DIR = path.join(process.cwd(), 'test_data/full_pipeline')
  const FULL_E2E = process.env.FULL_E2E === '1'

  let tempDir: string

  test.beforeEach(() => {
    // Create a unique temp directory for this test run
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'full-pipeline-'))
    console.log(`Test working directory: ${tempDir}`)
  })

  test.afterEach(() => {
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  test('should transcribe audio, add embeddings, load in UI, modify, and save', async () => {
    test.setTimeout(30000) // Extend timeout for this E2E test
    let electronApp: ElectronApplication
    let window: Page

    try {
      // ============================================================
      // STAGE 1: Transcribe audio with ASR
      // ============================================================
      const srcAudio = path.join(process.cwd(), 'test_data/OSR_us_000_0010_8k.wav')
      const stage1Golden = path.join(GOLDEN_DIR, '1_after_transcribe.vtt')
      const stage1Output = path.join(tempDir, '1_after_transcribe.vtt')

      if (FULL_E2E || !fs.existsSync(stage1Golden)) {
        console.log('\n=== STAGE 1: Running transcribe.py ===')

        // Copy audio to temp directory for transcribe.py
        const tempAudio = path.join(tempDir, 'OSR_us_000_0010_8k.wav')
        fs.copyFileSync(srcAudio, tempAudio)

        const transcribeCmd = `cd transcribe && uv run python transcribe.py "${tempAudio}"`
        execSync(transcribeCmd, { stdio: 'inherit' })

        // Move the output to stage1Output
        const generatedVtt = path.join(tempDir, 'OSR_us_000_0010_8k.vtt')
        if (fs.existsSync(generatedVtt)) {
          fs.renameSync(generatedVtt, stage1Output)
        }

        expect(fs.existsSync(stage1Output)).toBe(true)
        console.log(`✓ Stage 1 complete: ${stage1Output}`)

        // In FULL_E2E mode, update the golden file
        if (FULL_E2E) {
          fs.mkdirSync(GOLDEN_DIR, { recursive: true })
          fs.copyFileSync(stage1Output, stage1Golden)
          console.log(`✓ Updated golden file: ${stage1Golden}`)
        }
      } else {
        console.log('\n=== STAGE 1: Using cached transcription ===')
        console.log(`Using golden file: ${stage1Golden}`)
        // Copy golden file to temp directory
        fs.copyFileSync(stage1Golden, stage1Output)
      }

      // Verify stage 1 output has cues
      const stage1Content = fs.readFileSync(stage1Output, 'utf-8')
      expect(stage1Content).toContain('WEBVTT')
      expect(stage1Content).toContain('-->') // At least one cue

      // ============================================================
      // STAGE 2: Add speaker embeddings
      // ============================================================
      const stage2Golden = path.join(GOLDEN_DIR, '2_after_embed.vtt')
      const stage2Output = path.join(tempDir, '2_after_embed.vtt')

      if (FULL_E2E || !fs.existsSync(stage2Golden)) {
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

        // In FULL_E2E mode, update the golden file
        if (FULL_E2E) {
          fs.mkdirSync(GOLDEN_DIR, { recursive: true })
          fs.copyFileSync(stage2Output, stage2Golden)
          console.log(`✓ Updated golden file: ${stage2Golden}`)
        }
      } else {
        console.log('\n=== STAGE 2: Using cached embeddings ===')
        console.log(`Using golden file: ${stage2Golden}`)
        // Copy golden file to temp directory
        fs.copyFileSync(stage2Golden, stage2Output)
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

      // Copy stage 2 output to a working file for UI to modify (in temp directory)
      const stage3Working = path.join(tempDir, '3_working.vtt')
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

      // Wait for segments to load
      await window.waitForFunction(
        () => {
          const store = (window as any).$store
          return store && store.document && store.document.segments && store.document.segments.length > 0
        },
        { timeout: 5000 }
      )

      // Verify we have segments loaded
      const storeState = await window.evaluate(() => {
        const store = (window as any).$store
        return {
          segmentCount: store?.document?.segments?.length || 0,
          filePath: store?.document?.filePath
        }
      })

      expect(storeState.segmentCount).toBeGreaterThan(0)
      console.log(`Loaded ${storeState.segmentCount} segments in the UI`)

      // Wait for AG Grid to render
      await window.waitForSelector('.ag-row', { timeout: 5000 })

      // Modify rating and speaker name directly via store
      await window.evaluate(() => {
        const store = (window as any).$store
        const firstSegment = store.document.segments[0]
        // Update both rating and speaker name in one call
        store.updateCue(firstSegment.id, { rating: 3, speakerName: 'TestSpeaker' })
      })
      await window.waitForTimeout(300)
      console.log('✓ Set rating to 3 stars')
      console.log('✓ Changed speaker name to "TestSpeaker"')

      // Save the file programmatically (more reliable than keyboard shortcut)
      await window.evaluate(async () => {
        const electronAPI = (window as any).electronAPI
        const store = (window as any).$store
        const content = store.exportToString()
        const result = await electronAPI.saveExistingFile({
          filePath: store.document.filePath,
          content
        })
        if (!result.success) {
          throw new Error('Save failed: ' + result.error)
        }
      })
      await window.waitForTimeout(500)
      console.log('✓ Saved file')

      // Copy the saved working file to stage 3 output (in temp directory)
      const stage3Output = path.join(tempDir, '3_after_ui_edit.vtt')
      fs.copyFileSync(stage3Working, stage3Output)
      console.log(`✓ Stage 3 complete: ${stage3Output}`)

      // In FULL_E2E mode, update the golden file
      if (FULL_E2E) {
        const stage3Golden = path.join(GOLDEN_DIR, '3_after_ui_edit.vtt')
        fs.mkdirSync(GOLDEN_DIR, { recursive: true })
        fs.copyFileSync(stage3Output, stage3Golden)
        console.log(`✓ Updated golden file: ${stage3Golden}`)
      }

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

      // 4. Verify word-level timestamps are present in stage 1 output
      const wordTimestampsPresent = stage1Content.includes('"words":')
      expect(wordTimestampsPresent).toBe(true)
      console.log('✓ Word-level timestamps generated by transcribe.py')

      // 5. Verify word-level timestamps are preserved through all stages
      if (wordTimestampsPresent) {
        const stage2WordsPresent = stage2Content.includes('"words":')
        const stage3WordsPresent = stage3Content.includes('"words":')
        expect(stage2WordsPresent).toBe(true)
        expect(stage3WordsPresent).toBe(true)
        console.log('✓ Word-level timestamps preserved through pipeline')
      }

      console.log('\n🎉 Full E2E pipeline test completed successfully!')

    } finally {
      // Cleanup is handled by test.afterEach
      if (electronApp) {
        try {
          await electronApp.close()
        } catch (e) {
          // Already closed
        }
      }
    }
  })

  test('should parse sample_with_words.vtt and preserve word timestamps', async () => {
    test.setTimeout(15000)
    let electronApp: ElectronApplication
    let window: Page

    try {
      const sampleFile = path.join(process.cwd(), 'test_data/sample_with_words.vtt')
      expect(fs.existsSync(sampleFile)).toBe(true)

      // Read and verify the sample file
      const sampleContent = fs.readFileSync(sampleFile, 'utf-8')
      expect(sampleContent).toContain('WEBVTT')
      expect(sampleContent).toContain('TranscriptSegment')
      expect(sampleContent).toContain('"words":')
      console.log('✓ sample_with_words.vtt contains word-level timestamps')

      // Launch Electron app with the sample file
      electronApp = await electron.launch({
        args: [
          path.join(process.cwd(), 'dist-electron/main.cjs'),
          '--no-sandbox',
          sampleFile
        ],
        env: {
          ...process.env,
          NODE_ENV: 'test',
          DISPLAY: process.env.DISPLAY || ':99'
        }
      })

      window = await electronApp.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      // Wait for segments to load
      await window.waitForFunction(
        () => {
          const store = (window as any).$store
          return store && store.document && store.document.segments && store.document.segments.length > 0
        },
        { timeout: 5000 }
      )

      // Verify segments with words loaded correctly
      const result = await window.evaluate(() => {
        const store = (window as any).$store
        const segments = store.document.segments
        const firstSegment = segments[0]
        return {
          segmentCount: segments.length,
          hasWords: firstSegment.words && firstSegment.words.length > 0,
          wordCount: firstSegment.words?.length || 0,
          firstWordText: firstSegment.words?.[0]?.text,
          firstWordStart: firstSegment.words?.[0]?.startTime,
          segmentText: firstSegment.text
        }
      })

      expect(result.segmentCount).toBeGreaterThan(0)
      expect(result.hasWords).toBe(true)
      expect(result.wordCount).toBeGreaterThan(0)
      console.log(`✓ Loaded ${result.segmentCount} segments`)
      console.log(`✓ First segment has ${result.wordCount} words`)
      console.log(`✓ First word: "${result.firstWordText}" at ${result.firstWordStart}s`)

      await electronApp.close()

      console.log('✓ sample_with_words.vtt test passed')
    } finally {
      // No cleanup needed for this test
    }
  })
})
