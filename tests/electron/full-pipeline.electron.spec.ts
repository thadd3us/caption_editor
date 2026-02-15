import { test, expect } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { enableConsoleCapture } from '../helpers/console'
import { launchElectron } from '../helpers/electron-launch'
import { getProjectRoot, getElectronMainPath } from '../helpers/project-root'

test.describe('Full E2E Pipeline @expensive', () => {
  test('should transcribe audio, add embeddings, load in UI, modify, and save', async () => {
    test.setTimeout(240000)

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'full-pipeline-'))
    const srcAudio = path.join(getProjectRoot(), 'test_data/full_pipeline/OSR_us_000_0010_8k.wav')
    const destAudioPath = path.join(tmpDir, 'test_audio.wav')
    fs.copyFileSync(srcAudio, destAudioPath)

    const env = {
      ...process.env,
      // Use NODE_ENV=test so Electron doesn't intercept close with the
      // "unsaved changes" confirmation dialog during E2E.
      // We still exercise the uvx path by keeping CAPTION_EDITOR_RUN_TRANSCRIBE_FROM_CODE_TREE=0.
      NODE_ENV: 'test',
      CAPTION_EDITOR_RUN_TRANSCRIBE_FROM_CODE_TREE: '0',
      DISPLAY: process.env.DISPLAY || ':99'
    }

    const electronApp = await launchElectron({ env })
    const window = await electronApp.firstWindow()
    enableConsoleCapture(window)

    try {
      await window.waitForLoadState('domcontentloaded')

      // Use a tiny model for speed.
      await window.evaluate(() => {
        ;(window as any).__ASR_MODEL_OVERRIDE = 'openai/whisper-tiny'
      })

      // Load media.
      await window.evaluate((audioPath) => {
        const store = (window as any).$store
        if (!store) throw new Error('$store not found')
        store.loadMediaFile(`media://local${audioPath}`, audioPath)
      }, destAudioPath)

      await window.waitForFunction(() => {
        const store = (window as any).$store
        return !!store?.mediaPath
      })

      // Run ASR from the menu handler (transcribe + embed) and wait for it to finish.
      await window.evaluate(() => {
        const fn = (window as any).handleMenuAsrCaption
        if (!fn) throw new Error('handleMenuAsrCaption not exposed on window')
        fn()
      })

      await window.waitForSelector('.asr-modal-overlay', { timeout: 10000 })
      await window.waitForSelector('.asr-modal-overlay', { state: 'hidden', timeout: 240000 })

      // Ensure captions were loaded.
      await window.waitForFunction(() => {
        const store = (window as any).$store
        return (store?.document?.segments?.length || 0) > 0 && !!store?.document?.filePath
      }, { timeout: 60000 })

      // Apply edits and save.
      const savedPath = await window.evaluate(async () => {
        const store = (window as any).$store
        const electronAPI = (window as any).electronAPI
        const first = store.document.segments[0]
        store.updateSegment(first.id, { rating: 3, speakerName: 'TestSpeaker' })

        const content = store.exportToString()
        const filePath = store.document.filePath
        const result = await electronAPI.saveExistingFile({ filePath, content })
        if (!result?.success) throw new Error('Save failed: ' + result?.error)
        return filePath
      })

      // Verify persisted output on disk.
      const parsed = JSON.parse(fs.readFileSync(savedPath, 'utf-8'))
      expect(Array.isArray(parsed.segments)).toBe(true)
      expect(parsed.segments.length).toBeGreaterThan(0)
      expect(parsed.segments[0].speakerName).toBe('TestSpeaker')
      expect(parsed.segments[0].rating).toBe(3)

      const anyWords = parsed.segments.some((s: any) => Array.isArray(s.words) && s.words.length > 0)
      expect(anyWords).toBe(true)

      // Embeddings live at the document level (array of { segmentId, speakerEmbedding }).
      expect(Array.isArray(parsed.embeddings)).toBe(true)
      expect(parsed.embeddings.length).toBeGreaterThan(0)
      const anyEmbeddings = parsed.embeddings.some(
        (e: any) => typeof e.segmentId === 'string' && Array.isArray(e.speakerEmbedding) && e.speakerEmbedding.length > 0
      )
      expect(anyEmbeddings).toBe(true)
    } finally {
      // Make close deterministic even if something marked the doc dirty.
      await window.evaluate(() => {
        const store = (window as any).$store
        store?.setIsDirty?.(false)
      }).catch(() => {})
      await electronApp.close().catch(() => {})
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  test('should load captions JSON with words and preserve word timestamps', async () => {
    test.setTimeout(30000)

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'words-fixture-'))
    const captionsPath = path.join(tmpDir, 'sample_with_words.captions_json')

    fs.writeFileSync(
      captionsPath,
      JSON.stringify(
        {
          metadata: { id: 'sample-with-words' },
          segments: [
            {
              id: 'seg1',
              startTime: 0,
              endTime: 2,
              text: 'Hello world',
              words: [
                { text: 'Hello', startTime: 0.0, endTime: 0.9 },
                { text: 'world', startTime: 1.0, endTime: 1.8 }
              ]
            }
          ]
        },
        null,
        2
      ),
      'utf-8'
    )

    const electronApp = await launchElectron({
      args: [getElectronMainPath(), '--no-sandbox', captionsPath],
      env: { ...process.env, NODE_ENV: 'test', DISPLAY: process.env.DISPLAY || ':99' }
    })
    const window = await electronApp.firstWindow()

    try {
      await window.waitForLoadState('domcontentloaded')
      await window.waitForFunction(() => {
        const store = (window as any).$store
        return (store?.document?.segments?.length || 0) > 0
      }, { timeout: 10000 })

      const result = await window.evaluate(() => {
        const store = (window as any).$store
        const first = store.document.segments[0]
        return {
          segmentCount: store.document.segments.length,
          wordCount: first.words?.length || 0,
          firstWordText: first.words?.[0]?.text,
          firstWordStart: first.words?.[0]?.startTime
        }
      })

      expect(result.segmentCount).toBe(1)
      expect(result.wordCount).toBe(2)
      expect(result.firstWordText).toBe('Hello')
      expect(result.firstWordStart).toBe(0)
    } finally {
      await electronApp.close().catch(() => {})
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
