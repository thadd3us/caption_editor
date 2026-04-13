import { sharedElectronTest as test, expect } from '../helpers/shared-electron'
import * as path from 'path'
import * as fs from 'fs/promises'
import { getProjectRoot } from '../helpers/project-root'

/**
 * Regression test for: opening a second captions_json5 file should replace
 * the first file's media in the player.
 *
 * Bug: The media *path* shown in the UI updates correctly, but the actual
 * <audio> element still plays the first file's media.  This happens because
 * attemptMediaAutoLoad() bails out when store.mediaPath is already set.
 */
test.describe('Opening a second captions file should replace media', () => {
  const tempDir = path.join(getProjectRoot(), 'test_data', 'temp-second-file-media')

  // Two existing test WAVs with very different durations:
  //   OSR_us_000_0010_8k.wav  ≈ 33.6 s
  //   test-audio-10s.wav      = 10.0 s
  const _mediaA = path.join(getProjectRoot(), 'test_data', 'OSR_us_000_0010_8k.wav')
  const _mediaB = path.join(getProjectRoot(), 'test_data', 'test-audio-10s.wav')

  test.beforeAll(async () => {
    await fs.mkdir(tempDir, { recursive: true })
  })

  test.afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
  })

  test('second file media should replace first file media in the player', async ({ page }) => {
    test.setTimeout(30000)

    // --- Create two captions files, each pointing at a different audio file ---

    const captionsFileA = path.join(tempDir, 'fileA.captions_json5')
    await fs.writeFile(
      captionsFileA,
      JSON.stringify({
        metadata: { id: 'doc-A', mediaFilePath: '../OSR_us_000_0010_8k.wav' },
        segments: [
          { id: 'a1', startTime: 0, endTime: 1, text: 'File A segment' }
        ]
      }, null, 2),
      'utf-8'
    )

    const captionsFileB = path.join(tempDir, 'fileB.captions_json5')
    await fs.writeFile(
      captionsFileB,
      JSON.stringify({
        metadata: { id: 'doc-B', mediaFilePath: '../test-audio-10s.wav' },
        segments: [
          { id: 'b1', startTime: 0, endTime: 1, text: 'File B segment' }
        ]
      }, null, 2),
      'utf-8'
    )

    // --- Reset app state ---
    await page.evaluate(() => {
      const store = (window as any).$store
      store.reset()
    })
    await page.waitForTimeout(200)

    // --- Open file A ---
    await page.evaluate(async (filePath) => {
      const api = (window as any).electronAPI
      const results = await api.processDroppedFiles([filePath])
      const store = (window as any).$store
      for (const r of results) {
        if (r.type === 'captions_json5' && r.content) {
          store.loadFromFile(r.content, r.filePath)
        }
      }
    }, captionsFileA)

    // Wait for media auto-load to finish
    await page.waitForFunction(() => {
      const store = (window as any).$store
      return !!store?.mediaPath
    }, { timeout: 10000 })

    // Wait for the audio element to fully load so we can read its duration
    await page.waitForFunction(() => {
      const audio = document.querySelector('audio') as HTMLAudioElement | null
      return audio && audio.readyState >= 1 && audio.duration > 0
    }, { timeout: 10000 })

    const stateAfterA = await page.evaluate(() => {
      const store = (window as any).$store
      const audio = document.querySelector('audio') as HTMLAudioElement | null
      return {
        storeMediaPath: store.mediaPath,
        metadataMediaFilePath: store.document.metadata.mediaFilePath,
        audioSrc: audio?.src ?? null,
        audioDuration: audio?.duration ?? null
      }
    })

    console.log('After opening file A:', stateAfterA)

    // Sanity-check: file A's audio is ~33.6s
    expect(stateAfterA.audioDuration).toBeGreaterThan(30)
    expect(stateAfterA.storeMediaPath).toContain('OSR_us_000_0010_8k.wav')

    // --- Now open file B (the second file) ---
    await page.evaluate(async (filePath) => {
      const api = (window as any).electronAPI
      const results = await api.processDroppedFiles([filePath])
      const store = (window as any).$store
      for (const r of results) {
        if (r.type === 'captions_json5' && r.content) {
          store.loadFromFile(r.content, r.filePath)
        }
      }
    }, captionsFileB)

    // Give the auto-load watcher time to fire
    await page.waitForTimeout(1000)

    const stateAfterB = await page.evaluate(() => {
      const store = (window as any).$store
      const audio = document.querySelector('audio') as HTMLAudioElement | null
      return {
        storeMediaPath: store.mediaPath,
        metadataMediaFilePath: store.document.metadata.mediaFilePath,
        audioSrc: audio?.src ?? null,
        audioDuration: audio?.duration ?? null,
        documentId: store.document.metadata.id,
        segmentText: store.document.segments[0]?.text
      }
    })

    console.log('After opening file B:', stateAfterB)

    // The document should be file B's
    expect(stateAfterB.documentId).toBe('doc-B')
    expect(stateAfterB.segmentText).toBe('File B segment')

    // The metadata media path should point to the second file's audio
    expect(stateAfterB.metadataMediaFilePath).toContain('test-audio-10s.wav')

    // BUG ASSERTION: the *actual* audio element should now be playing
    // file B's media (~10s), NOT file A's media (~33.6s).
    //
    // If this assertion fails, it means the audio element still has
    // file A's media loaded — confirming the bug.
    expect(stateAfterB.audioSrc).toContain('test-audio-10s.wav')
    expect(stateAfterB.audioDuration).toBeLessThan(15)
    expect(stateAfterB.audioDuration).toBeGreaterThan(5)
  })
})
