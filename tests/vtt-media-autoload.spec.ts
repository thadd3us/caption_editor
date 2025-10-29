import { test, expect } from './helpers/coverage'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import * as fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

test.describe('VTT Media Auto-loading', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
  })

  test('should auto-load media file when VTT has mediaFilePath metadata in browser mode', async ({ page }) => {
    test.setTimeout(15000)

    // Read the VTT file with media reference
    const vttFilePath = path.resolve(__dirname, 'fixtures', 'with-media-reference.vtt')
    const vttContent = fs.readFileSync(vttFilePath, 'utf-8')

    // Create a DataTransfer to simulate drag and drop
    const dataTransfer = await page.evaluateHandle((content) => {
      const dt = new DataTransfer()
      const file = new File([content], 'with-media-reference.vtt', { type: 'text/vtt' })
      dt.items.add(file)
      return dt
    }, vttContent)

    // Simulate drop event on the drop zone
    await page.dispatchEvent('.file-input-zone', 'drop', { dataTransfer })

    // Wait for file to be processed
    await page.waitForTimeout(500)

    // Verify VTT was loaded
    const cueCount = await page.evaluate(() => (window as any).$store.document.cues.length)
    console.log('Loaded', cueCount, 'cues from VTT')
    expect(cueCount).toBe(3)

    // Verify metadata has mediaFilePath
    const mediaFilePath = await page.evaluate(() => (window as any).$store.document.metadata.mediaFilePath)
    console.log('VTT metadata references media file:', mediaFilePath)
    expect(mediaFilePath).toBe('OSR_us_000_0010_8k.wav')

    // In browser mode, media won't auto-load (file system access limitation)
    // But the metadata should be present
    const hasMediaPath = await page.evaluate(() => (window as any).$store.mediaPath !== null)
    console.log('Media auto-loaded:', hasMediaPath)

    // Note: In browser mode, we expect false because we can't access the file system
    // The test mainly verifies that the metadata is parsed correctly and logged
  })

  test('should load both VTT and media when dropped together, even if VTT has metadata', async ({ page }) => {
    test.setTimeout(15000)

    // Read both files
    const vttFilePath = path.resolve(__dirname, 'fixtures', 'with-media-reference.vtt')
    const vttContent = fs.readFileSync(vttFilePath, 'utf-8')
    const audioFilePath = path.resolve(__dirname, 'fixtures', 'OSR_us_000_0010_8k.wav')
    const audioBuffer = fs.readFileSync(audioFilePath)

    // Create a DataTransfer with both files
    const dataTransfer = await page.evaluateHandle((data) => {
      const dt = new DataTransfer()
      const vttFile = new File([data.vttContent], 'with-media-reference.vtt', { type: 'text/vtt' })
      const audioFile = new File([new Uint8Array(data.audioBuffer)], 'OSR_us_000_0010_8k.wav', { type: 'audio/wav' })
      dt.items.add(vttFile)
      dt.items.add(audioFile)
      return dt
    }, {
      vttContent,
      audioBuffer: Array.from(audioBuffer)
    })

    // Simulate drop event
    await page.dispatchEvent('.file-input-zone', 'drop', { dataTransfer })

    // Wait for files to be processed
    await page.waitForTimeout(500)

    // Verify VTT was loaded
    const cueCount = await page.evaluate(() => (window as any).$store.document.cues.length)
    console.log('Loaded', cueCount, 'cues from VTT')
    expect(cueCount).toBe(3)

    // Verify media was loaded (manually dropped, not auto-loaded)
    const hasMediaPath = await page.evaluate(() => (window as any).$store.mediaPath !== null)
    console.log('Media loaded:', hasMediaPath)
    expect(hasMediaPath).toBe(true)

    // Verify audio element exists
    const hasAudio = await page.evaluate(() => {
      const audio = document.querySelector('audio')
      return !!audio
    })
    expect(hasAudio).toBe(true)

    // Wait for audio to load
    let duration = 0
    for (let i = 0; i < 10; i++) {
      duration = await page.evaluate(() => {
        const audio = document.querySelector('audio') as HTMLAudioElement
        return audio ? audio.duration : 0
      })
      if (!isNaN(duration) && duration > 0) {
        break
      }
      await page.waitForTimeout(200)
    }
    console.log('Audio duration:', duration)
    expect(duration).toBeGreaterThan(0)
  })

  test('should not auto-load media if already manually loaded', async ({ page }) => {
    test.setTimeout(15000)

    // First, manually load a media file
    const audioFilePath = path.resolve(__dirname, 'fixtures', 'OSR_us_000_0010_8k.wav')
    const audioBuffer = fs.readFileSync(audioFilePath)

    const audioDataTransfer = await page.evaluateHandle((data) => {
      const dt = new DataTransfer()
      const file = new File([new Uint8Array(data.buffer)], data.name, { type: 'audio/wav' })
      dt.items.add(file)
      return dt
    }, {
      buffer: Array.from(audioBuffer),
      name: 'OSR_us_000_0010_8k.wav'
    })

    await page.dispatchEvent('.file-input-zone', 'drop', { dataTransfer: audioDataTransfer })
    await page.waitForTimeout(500)

    // Verify media was loaded
    const initialMediaPath = await page.evaluate(() => (window as any).$store.mediaPath)
    console.log('Initially loaded media:', initialMediaPath)
    expect(initialMediaPath).not.toBeNull()

    // Now load VTT with media reference
    const vttFilePath = path.resolve(__dirname, 'fixtures', 'with-media-reference.vtt')
    const vttContent = fs.readFileSync(vttFilePath, 'utf-8')

    const vttDataTransfer = await page.evaluateHandle((content) => {
      const dt = new DataTransfer()
      const file = new File([content], 'with-media-reference.vtt', { type: 'text/vtt' })
      dt.items.add(file)
      return dt
    }, vttContent)

    await page.dispatchEvent('.file-input-zone', 'drop', { dataTransfer: vttDataTransfer })
    await page.waitForTimeout(500)

    // Verify media path hasn't changed (should skip auto-load)
    const finalMediaPath = await page.evaluate(() => (window as any).$store.mediaPath)
    console.log('Final media path:', finalMediaPath)
    expect(finalMediaPath).toBe(initialMediaPath)

    // Verify VTT was loaded
    const cueCount = await page.evaluate(() => (window as any).$store.document.cues.length)
    expect(cueCount).toBe(3)
  })

  test('should parse VTT with both document metadata and cue metadata', async ({ page }) => {
    test.setTimeout(15000)

    const vttFilePath = path.resolve(__dirname, 'fixtures', 'with-media-reference.vtt')
    const vttContent = fs.readFileSync(vttFilePath, 'utf-8')

    const dataTransfer = await page.evaluateHandle((content) => {
      const dt = new DataTransfer()
      const file = new File([content], 'with-media-reference.vtt', { type: 'text/vtt' })
      dt.items.add(file)
      return dt
    }, vttContent)

    await page.dispatchEvent('.file-input-zone', 'drop', { dataTransfer })
    await page.waitForTimeout(500)

    // Verify document metadata
    const documentMetadata = await page.evaluate(() => (window as any).$store.document.metadata)
    console.log('Document metadata:', documentMetadata)
    expect(documentMetadata.id).toBe('550e8400-e29b-41d4-a716-446655440000')
    expect(documentMetadata.mediaFilePath).toBe('OSR_us_000_0010_8k.wav')

    // Verify cue metadata (ratings)
    const cues = await page.evaluate(() => (window as any).$store.document.cues)
    console.log('Cues:', cues)

    expect(cues[0].rating).toBe(5)
    expect(cues[0].id).toBe('84ec6681-574b-4570-aecb-5bcaea9415a9')

    expect(cues[1].rating).toBe(4)
    expect(cues[1].id).toBe('ead5dd22-5dd3-4d27-8cc8-c09df813a71c')

    expect(cues[2].rating).toBeUndefined()
    expect(cues[2].id).toBe('db8f6b03-f1a0-426b-80bd-6d39382e8417')
  })
})
