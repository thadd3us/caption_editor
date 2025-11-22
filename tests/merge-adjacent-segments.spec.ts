import { test, expect, _electron as electron } from '@playwright/test'
import { ElectronApplication, Page } from '@playwright/test'
import * as path from 'path'
import { enableConsoleCapture } from './helpers/console'

test.describe('VTT Editor - Merge Adjacent Segments', () => {
  let electronApp: ElectronApplication
  let window: Page

  test.beforeAll(async () => {
    // Launch Electron app
    electronApp = await electron.launch({
      args: [path.join(process.cwd(), 'dist-electron/main.cjs'), '--no-sandbox'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DISPLAY: process.env.DISPLAY || ':99'
      }
    })

    // Wait for the first window
    window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    enableConsoleCapture(window)
  })

  test.afterAll(async () => {
    await electronApp.close()
  })

  test('should merge two adjacent segments', async () => {
    // Load VTT with two adjacent segments
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:TranscriptSegment {"id":"seg1","startTime":0,"endTime":5,"text":"Hello","rating":3}

seg1
00:00:00.000 --> 00:00:05.000
Hello

NOTE CAPTION_EDITOR:TranscriptSegment {"id":"seg2","startTime":5,"endTime":10,"text":"world","rating":5}

seg2
00:00:05.000 --> 00:00:10.000
world`

      vttStore.loadFromFile(vttContent, '/test/file.vtt')
    })

    await window.waitForTimeout(200)

    // Verify we have 2 segments initially
    const initialSegments = await window.evaluate(() => {
      const vttStore = (window as any).$store
      return vttStore.document.segments
    })
    expect(initialSegments).toHaveLength(2)

    // Merge the adjacent segments
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      const segments = vttStore.document.segments
      vttStore.mergeAdjacentSegments([segments[0].id, segments[1].id])
    })

    await window.waitForTimeout(200)

    // Verify we have 1 merged segment
    const mergedSegments = await window.evaluate(() => {
      const vttStore = (window as any).$store
      return vttStore.document.segments
    })

    expect(mergedSegments).toHaveLength(1)
    expect(mergedSegments[0].text).toBe('Hello world')
    expect(mergedSegments[0].startTime).toBe(0)
    expect(mergedSegments[0].endTime).toBe(10)
    expect(mergedSegments[0].rating).toBe(5) // highest rating
  })

  test('should merge three adjacent segments', async () => {
    // Load VTT with three adjacent segments
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:TranscriptSegment {"id":"seg1","startTime":0,"endTime":5,"text":"One"}

seg1
00:00:00.000 --> 00:00:05.000
One

NOTE CAPTION_EDITOR:TranscriptSegment {"id":"seg2","startTime":5,"endTime":10,"text":"Two"}

seg2
00:00:05.000 --> 00:00:10.000
Two

NOTE CAPTION_EDITOR:TranscriptSegment {"id":"seg3","startTime":10,"endTime":15,"text":"Three"}

seg3
00:00:10.000 --> 00:00:15.000
Three`

      vttStore.loadFromFile(vttContent, '/test/file.vtt')
    })

    await window.waitForTimeout(200)

    // Merge all three adjacent segments
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      const segments = vttStore.document.segments
      vttStore.mergeAdjacentSegments([segments[0].id, segments[1].id, segments[2].id])
    })

    await window.waitForTimeout(200)

    // Verify we have 1 merged segment
    const mergedSegments = await window.evaluate(() => {
      const vttStore = (window as any).$store
      return vttStore.document.segments
    })

    expect(mergedSegments).toHaveLength(1)
    expect(mergedSegments[0].text).toBe('One Two Three')
    expect(mergedSegments[0].startTime).toBe(0)
    expect(mergedSegments[0].endTime).toBe(15)
  })

  test('should not merge non-adjacent segments', async () => {
    // Load VTT with three segments
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:TranscriptSegment {"id":"seg1","startTime":0,"endTime":5,"text":"One"}

seg1
00:00:00.000 --> 00:00:05.000
One

NOTE CAPTION_EDITOR:TranscriptSegment {"id":"seg2","startTime":5,"endTime":10,"text":"Two"}

seg2
00:00:05.000 --> 00:00:10.000
Two

NOTE CAPTION_EDITOR:TranscriptSegment {"id":"seg3","startTime":10,"endTime":15,"text":"Three"}

seg3
00:00:10.000 --> 00:00:15.000
Three`

      vttStore.loadFromFile(vttContent, '/test/file.vtt')
    })

    await window.waitForTimeout(200)

    // Try to merge seg1 and seg3 (skipping seg2 - they are not adjacent)
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      const segments = vttStore.document.segments
      vttStore.mergeAdjacentSegments([segments[0].id, segments[2].id])
    })

    await window.waitForTimeout(200)

    // Verify we still have 3 segments (merge should have failed)
    const segments = await window.evaluate(() => {
      const vttStore = (window as any).$store
      return vttStore.document.segments
    })

    expect(segments).toHaveLength(3)
  })

  test('should preserve speaker name when merging', async () => {
    // Load VTT with segments that have speaker names
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:TranscriptSegment {"id":"seg1","startTime":0,"endTime":5,"text":"Hello"}

seg1
00:00:00.000 --> 00:00:05.000
Hello

NOTE CAPTION_EDITOR:TranscriptSegment {"id":"seg2","startTime":5,"endTime":10,"text":"there","speakerName":"Alice"}

seg2
00:00:05.000 --> 00:00:10.000
there`

      vttStore.loadFromFile(vttContent, '/test/file.vtt')
    })

    await window.waitForTimeout(200)

    // Merge the segments
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      const segments = vttStore.document.segments
      vttStore.mergeAdjacentSegments([segments[0].id, segments[1].id])
    })

    await window.waitForTimeout(200)

    // Verify speaker name is preserved (first non-empty)
    const mergedSegments = await window.evaluate(() => {
      const vttStore = (window as any).$store
      return vttStore.document.segments
    })

    expect(mergedSegments).toHaveLength(1)
    expect(mergedSegments[0].speakerName).toBe('Alice')
  })

  test('should check adjacency when building context menu', async () => {
    // Load VTT with three segments
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:TranscriptSegment {"id":"seg1","startTime":0,"endTime":5,"text":"One"}

seg1
00:00:00.000 --> 00:00:05.000
One

NOTE CAPTION_EDITOR:TranscriptSegment {"id":"seg2","startTime":5,"endTime":10,"text":"Two"}

seg2
00:00:05.000 --> 00:00:10.000
Two

NOTE CAPTION_EDITOR:TranscriptSegment {"id":"seg3","startTime":10,"endTime":15,"text":"Three"}

seg3
00:00:10.000 --> 00:00:15.000
Three`

      vttStore.loadFromFile(vttContent, '/test/file.vtt')
    })

    await window.waitForTimeout(200)

    // Test adjacency check for adjacent segments (seg1 and seg2)
    const isAdjacentTest1 = await window.evaluate(() => {
      const vttStore = (window as any).$store
      const segments = vttStore.document.segments

      // Simulate the adjacency check function from CaptionTable
      function areSegmentsAdjacent(segmentIds: string[]): boolean {
        if (segmentIds.length < 2) return false

        const segs = segmentIds
          .map(id => vttStore.document.segments.find((s: any) => s.id === id))
          .filter((s: any) => s !== undefined)

        if (segs.length !== segmentIds.length) return false

        const sortedSegments = [...segs].sort((a: any, b: any) => {
          const ordinalA = a.ordinal ?? 0
          const ordinalB = b.ordinal ?? 0
          return ordinalA - ordinalB
        })

        for (let i = 0; i < sortedSegments.length - 1; i++) {
          const currentOrdinal = sortedSegments[i].ordinal ?? 0
          const nextOrdinal = sortedSegments[i + 1].ordinal ?? 0
          if (nextOrdinal !== currentOrdinal + 1) {
            return false
          }
        }

        return true
      }

      return areSegmentsAdjacent([segments[0].id, segments[1].id])
    })

    expect(isAdjacentTest1).toBe(true)

    // Test adjacency check for non-adjacent segments (seg1 and seg3)
    const isAdjacentTest2 = await window.evaluate(() => {
      const vttStore = (window as any).$store
      const segments = vttStore.document.segments

      function areSegmentsAdjacent(segmentIds: string[]): boolean {
        if (segmentIds.length < 2) return false

        const segs = segmentIds
          .map(id => vttStore.document.segments.find((s: any) => s.id === id))
          .filter((s: any) => s !== undefined)

        if (segs.length !== segmentIds.length) return false

        const sortedSegments = [...segs].sort((a: any, b: any) => {
          const ordinalA = a.ordinal ?? 0
          const ordinalB = b.ordinal ?? 0
          return ordinalA - ordinalB
        })

        for (let i = 0; i < sortedSegments.length - 1; i++) {
          const currentOrdinal = sortedSegments[i].ordinal ?? 0
          const nextOrdinal = sortedSegments[i + 1].ordinal ?? 0
          if (nextOrdinal !== currentOrdinal + 1) {
            return false
          }
        }

        return true
      }

      return areSegmentsAdjacent([segments[0].id, segments[2].id])
    })

    expect(isAdjacentTest2).toBe(false)
  })

  test('should add history entries for merged segments', async () => {
    // Load VTT with two segments
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:TranscriptSegment {"id":"seg1","startTime":0,"endTime":5,"text":"Hello"}

seg1
00:00:00.000 --> 00:00:05.000
Hello

NOTE CAPTION_EDITOR:TranscriptSegment {"id":"seg2","startTime":5,"endTime":10,"text":"world"}

seg2
00:00:05.000 --> 00:00:10.000
world`

      vttStore.loadFromFile(vttContent, '/test/file.vtt')
    })

    await window.waitForTimeout(200)

    // Get initial history length
    const initialHistoryLength = await window.evaluate(() => {
      const vttStore = (window as any).$store
      return vttStore.document.history?.length ?? 0
    })

    // Merge the segments
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      const segments = vttStore.document.segments
      vttStore.mergeAdjacentSegments([segments[0].id, segments[1].id])
    })

    await window.waitForTimeout(200)

    // Verify history entries were added (2 for the 2 merged segments)
    const finalHistory = await window.evaluate(() => {
      const vttStore = (window as any).$store
      return vttStore.document.history
    })

    expect(finalHistory).toBeDefined()
    expect(finalHistory.length).toBe(initialHistoryLength + 2)
  })
})
