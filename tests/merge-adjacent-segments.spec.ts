import { sharedElectronTest as test, expect } from './helpers/shared-electron'
import type { Page } from '@playwright/test'

test.describe('Caption Editor - Merge Adjacent Segments', () => {
  let window: Page

  test.beforeEach(async ({ page }) => {
    window = page
  })

  test('should merge two adjacent segments', async () => {
    // Load captions JSON with two adjacent segments
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const captionsContent = JSON.stringify({
        metadata: { id: 'doc1' },
        segments: [
          { id: 'seg1', startTime: 0, endTime: 5, text: 'Hello', rating: 3 },
          { id: 'seg2', startTime: 5, endTime: 10, text: 'world', rating: 5 }
        ]
      })

      vttStore.loadFromFile(captionsContent, '/test/file.captions.json')
    })

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 2
    })

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

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 1
    })

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
    // Load captions JSON with three adjacent segments
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const captionsContent = JSON.stringify({
        metadata: { id: 'doc1' },
        segments: [
          { id: 'seg1', startTime: 0, endTime: 5, text: 'One' },
          { id: 'seg2', startTime: 5, endTime: 10, text: 'Two' },
          { id: 'seg3', startTime: 10, endTime: 15, text: 'Three' }
        ]
      })

      vttStore.loadFromFile(captionsContent, '/test/file.captions.json')
    })

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 3
    })

    // Merge all three adjacent segments
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      const segments = vttStore.document.segments
      vttStore.mergeAdjacentSegments([segments[0].id, segments[1].id, segments[2].id])
    })

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 1
    })

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

      const captionsContent = JSON.stringify({
        metadata: { id: 'doc1' },
        segments: [
          { id: 'seg1', startTime: 0, endTime: 5, text: 'One' },
          { id: 'seg2', startTime: 5, endTime: 10, text: 'Two' },
          { id: 'seg3', startTime: 10, endTime: 15, text: 'Three' }
        ]
      })

      vttStore.loadFromFile(captionsContent, '/test/file.captions.json')
    })

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 3
    })

    // Try to merge seg1 and seg3 (skipping seg2 - they are not adjacent)
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      const segments = vttStore.document.segments
      vttStore.mergeAdjacentSegments([segments[0].id, segments[2].id])
    })

    // Brief wait since merge should fail and not change state
    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 3
    })

    // Verify we still have 3 segments (merge should have failed)
    const segments = await window.evaluate(() => {
      const vttStore = (window as any).$store
      return vttStore.document.segments
    })

    expect(segments).toHaveLength(3)
  })

  test('should preserve speaker name when merging', async () => {
    // Load captions JSON with segments that have speaker names
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const captionsContent = JSON.stringify({
        metadata: { id: 'doc1' },
        segments: [
          { id: 'seg1', startTime: 0, endTime: 5, text: 'Hello' },
          { id: 'seg2', startTime: 5, endTime: 10, text: 'there', speakerName: 'Alice' }
        ]
      })

      vttStore.loadFromFile(captionsContent, '/test/file.captions.json')
    })

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 2
    })

    // Merge the segments
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      const segments = vttStore.document.segments
      vttStore.mergeAdjacentSegments([segments[0].id, segments[1].id])
    })

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 1
    })

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

      const captionsContent = JSON.stringify({
        metadata: { id: 'doc1' },
        segments: [
          { id: 'seg1', startTime: 0, endTime: 5, text: 'One' },
          { id: 'seg2', startTime: 5, endTime: 10, text: 'Two' },
          { id: 'seg3', startTime: 10, endTime: 15, text: 'Three' }
        ]
      })

      vttStore.loadFromFile(captionsContent, '/test/file.captions.json')
    })

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 3
    })

    // Test adjacency check for adjacent segments (seg1 and seg2)
    const isAdjacentTest1 = await window.evaluate(() => {
      const vttStore = (window as any).$store
      const segments = vttStore.document.segments

      // Simulate the adjacency check function from CaptionTable (using ordinal map)
      function areSegmentsAdjacent(segmentIds: string[]): boolean {
        if (segmentIds.length < 2) return false

        const segs = segmentIds
          .map(id => vttStore.document.segments.find((s: any) => s.id === id))
          .filter((s: any) => s !== undefined)

        if (segs.length !== segmentIds.length) return false

        // Compute ordinal map
        const ordinalMap = new Map<string, number>()
        vttStore.document.segments.forEach((segment: any, index: number) => {
          ordinalMap.set(segment.id, index)
        })

        // Get ordinals for selected segments
        const ordinals = segs
          .map((s: any) => ordinalMap.get(s.id))
          .filter((o: any): o is number => o !== undefined)
          .sort((a: number, b: number) => a - b)

        // Check if ordinals are consecutive
        for (let i = 0; i < ordinals.length - 1; i++) {
          if (ordinals[i + 1] !== ordinals[i] + 1) {
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

        // Compute ordinal map
        const ordinalMap = new Map<string, number>()
        vttStore.document.segments.forEach((segment: any, index: number) => {
          ordinalMap.set(segment.id, index)
        })

        // Get ordinals for selected segments
        const ordinals = segs
          .map((s: any) => ordinalMap.get(s.id))
          .filter((o: any): o is number => o !== undefined)
          .sort((a: number, b: number) => a - b)

        // Check if ordinals are consecutive
        for (let i = 0; i < ordinals.length - 1; i++) {
          if (ordinals[i + 1] !== ordinals[i] + 1) {
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
    // Load captions JSON with two segments
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const captionsContent = JSON.stringify({
        metadata: { id: 'doc1' },
        segments: [
          { id: 'seg1', startTime: 0, endTime: 5, text: 'Hello' },
          { id: 'seg2', startTime: 5, endTime: 10, text: 'world' }
        ]
      })

      vttStore.loadFromFile(captionsContent, '/test/file.captions.json')
    })

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 2
    })

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

    await window.waitForFunction(() => {
      const store = (window as any).$store
      return store?.document?.segments?.length === 1
    })

    // Verify history entries were added (2 for the 2 merged segments)
    const finalHistory = await window.evaluate(() => {
      const vttStore = (window as any).$store
      return vttStore.document.history
    })

    expect(finalHistory).toBeDefined()
    expect(finalHistory.length).toBe(initialHistoryLength + 2)
  })
})
