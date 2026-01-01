import { test, expect, _electron as electron } from '@playwright/test'
import { ElectronApplication, Page } from '@playwright/test'
import * as path from 'path'
import { enableConsoleCapture } from './helpers/console'

test.describe('VTT Editor - Word-Level Split', () => {
  let electronApp: ElectronApplication
  let window: Page

  test.beforeEach(async () => {
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

  test.afterEach(async () => {
    // Close any open context menus
    if (window) {
      await window.evaluate(() => {
        const overlay = document.querySelector('.context-menu-overlay')
        if (overlay) (overlay as HTMLElement).click()
      }).catch(() => {}) // Ignore errors if window is already closed
    }
    
    if (electronApp) { await electronApp.close().catch(() => {}) }
  })

  test('should render words as spans when segment has word-level timestamps', async () => {
    // Load VTT with word-level timestamps
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:TranscriptSegment {"id":"seg1","startTime":1,"endTime":5,"text":"Hello world today","words":[{"text":"Hello","startTime":1.0,"endTime":1.5},{"text":"world","startTime":2.0,"endTime":2.5},{"text":"today","startTime":3.0,"endTime":3.5}]}

seg1
00:00:01.000 --> 00:00:05.000
Hello world today`

      vttStore.loadFromFile(vttContent, '/test/file.vtt')
    })

    await window.waitForTimeout(200)

    // Seek to the segment time to display it
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (vttStore) vttStore.setCurrentTime(2.0)
    })

    await window.waitForTimeout(100)

    // Verify words are rendered as spans
    const captionText = window.locator('.caption-text')
    const wordSpans = captionText.locator('.word-span')

    const wordCount = await wordSpans.count()
    expect(wordCount).toBe(3)

    // Verify each word has correct attributes
    const firstWord = wordSpans.nth(0)
    await expect(firstWord).toHaveText('Hello')
    await expect(firstWord).toHaveAttribute('data-has-timestamp', 'true')
    await expect(firstWord).toHaveAttribute('data-word-index', '0')

    const secondWord = wordSpans.nth(1)
    await expect(secondWord).toHaveText('world')
    await expect(secondWord).toHaveAttribute('data-has-timestamp', 'true')
    await expect(secondWord).toHaveAttribute('data-word-index', '1')
  })

  test('should show context menu on word right-click with split option enabled', async () => {
    // Load VTT with word-level timestamps
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:TranscriptSegment {"id":"seg1","startTime":1,"endTime":5,"text":"Hello world today","words":[{"text":"Hello","startTime":1.0,"endTime":1.5},{"text":"world","startTime":2.0,"endTime":2.5},{"text":"today","startTime":3.0,"endTime":3.5}]}

seg1
00:00:01.000 --> 00:00:05.000
Hello world today`

      vttStore.loadFromFile(vttContent, '/test/file.vtt')
      vttStore.setCurrentTime(2.0)
    })

    await window.waitForTimeout(200)

    // Right-click on the second word (index 1)
    const secondWord = window.locator('.word-span[data-word-index="1"]')
    await secondWord.click({ button: 'right' })

    await window.waitForTimeout(100)

    // Verify context menu is visible
    const contextMenu = window.locator('.context-menu')
    await expect(contextMenu).toBeVisible()

    // Verify split option is enabled (not disabled)
    const splitMenuItem = contextMenu.locator('.context-menu-item')
    await expect(splitMenuItem).toHaveText('Split segment starting here')
    await expect(splitMenuItem).not.toHaveClass(/disabled/)
  })

  test('should split segment when clicking split option in context menu', async () => {
    // Load VTT with word-level timestamps
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:TranscriptSegment {"id":"seg1","startTime":1,"endTime":5,"text":"Hello world today","words":[{"text":"Hello","startTime":1.0,"endTime":1.5},{"text":"world","startTime":2.0,"endTime":2.5},{"text":"today","startTime":3.0,"endTime":3.5}],"speakerName":"Alice","rating":4}

seg1
00:00:01.000 --> 00:00:05.000
Hello world today`

      vttStore.loadFromFile(vttContent, '/test/file.vtt')
      vttStore.setCurrentTime(2.0)
    })

    await window.waitForTimeout(200)

    // Verify initial state - one segment
    let segmentCount = await window.evaluate(() => {
      const vttStore = (window as any).$store
      return vttStore ? vttStore.document.segments.length : 0
    })
    expect(segmentCount).toBe(1)

    // Right-click on the second word (index 1) to split before "world"
    const secondWord = window.locator('.word-span[data-word-index="1"]')
    await secondWord.click({ button: 'right' })

    await window.waitForTimeout(100)

    // Click the split option using evaluate to bypass overlay
    await window.evaluate(() => {
      const menuItem = document.querySelector('.context-menu-item')
      if (menuItem) (menuItem as HTMLElement).click()
    })

    await window.waitForTimeout(200)

    // Verify we now have two segments
    segmentCount = await window.evaluate(() => {
      const vttStore = (window as any).$store
      return vttStore ? vttStore.document.segments.length : 0
    })
    expect(segmentCount).toBe(2)

    // Verify the segments have correct content
    const segments = await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return null
      return vttStore.document.segments.map((seg: any) => ({
        text: seg.text,
        startTime: seg.startTime,
        endTime: seg.endTime,
        speakerName: seg.speakerName,
        rating: seg.rating,
        wordsCount: seg.words?.length || 0
      }))
    })

    // First segment: "Hello" (word index 0)
    expect(segments[0].text).toBe('Hello')
    expect(segments[0].startTime).toBe(1.0)
    expect(segments[0].endTime).toBe(2.0) // Split at word[1].startTime
    expect(segments[0].speakerName).toBe('Alice')
    expect(segments[0].rating).toBe(4)
    expect(segments[0].wordsCount).toBe(1)

    // Second segment: "world today" (word index 1-2)
    expect(segments[1].text).toBe('world today')
    expect(segments[1].startTime).toBe(2.0) // Starts at word[1].startTime
    expect(segments[1].endTime).toBe(5.0)
    expect(segments[1].speakerName).toBe('Alice')
    expect(segments[1].rating).toBe(4)
    expect(segments[1].wordsCount).toBe(2)
  })

  test('should show disabled split option for first word', async () => {
    // Load VTT with word-level timestamps
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:TranscriptSegment {"id":"seg1","startTime":1,"endTime":5,"text":"Hello world","words":[{"text":"Hello","startTime":1.0,"endTime":1.5},{"text":"world","startTime":2.0,"endTime":2.5}]}

seg1
00:00:01.000 --> 00:00:05.000
Hello world`

      vttStore.loadFromFile(vttContent, '/test/file.vtt')
      vttStore.setCurrentTime(2.0)
    })

    await window.waitForTimeout(200)

    // Right-click on the first word (index 0)
    const firstWord = window.locator('.word-span[data-word-index="0"]')
    await firstWord.click({ button: 'right' })

    await window.waitForTimeout(100)

    // Verify context menu is visible
    const contextMenu = window.locator('.context-menu')
    await expect(contextMenu).toBeVisible()

    // Verify split option is disabled with reason
    const splitMenuItem = contextMenu.locator('.context-menu-item')
    await expect(splitMenuItem).toContainText('Split segment starting here')
    await expect(splitMenuItem).toContainText('(cannot split before first word)')
    await expect(splitMenuItem).toHaveClass(/disabled/)
  })

  test('should show disabled split option for word without timestamp', async () => {
    // Load VTT with mixed words (some with timestamps, some without)
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:TranscriptSegment {"id":"seg1","startTime":1,"endTime":5,"text":"Hello beautiful world","words":[{"text":"Hello","startTime":1.0,"endTime":1.5},{"text":"beautiful"},{"text":"world","startTime":3.0,"endTime":3.5}]}

seg1
00:00:01.000 --> 00:00:05.000
Hello beautiful world`

      vttStore.loadFromFile(vttContent, '/test/file.vtt')
      vttStore.setCurrentTime(2.0)
    })

    await window.waitForTimeout(200)

    // Right-click on the word without timestamp (index 1)
    const wordWithoutTimestamp = window.locator('.word-span[data-word-index="1"]')

    // Verify it's styled differently
    await expect(wordWithoutTimestamp).toHaveAttribute('data-has-timestamp', 'false')

    await wordWithoutTimestamp.click({ button: 'right' })

    await window.waitForTimeout(100)

    // Verify context menu is visible
    const contextMenu = window.locator('.context-menu')
    await expect(contextMenu).toBeVisible()

    // Verify split option is disabled with reason
    const splitMenuItem = contextMenu.locator('.context-menu-item')
    await expect(splitMenuItem).toContainText('Split segment starting here')
    await expect(splitMenuItem).toContainText('(word has no timestamp)')
    await expect(splitMenuItem).toHaveClass(/disabled/)
  })

  test('should fall back to plain text display when segment has no words', async () => {
    // Load VTT without word-level timestamps
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:TranscriptSegment {"id":"seg1","startTime":1,"endTime":5,"text":"Hello world"}

seg1
00:00:01.000 --> 00:00:05.000
Hello world`

      vttStore.loadFromFile(vttContent, '/test/file.vtt')
      vttStore.setCurrentTime(2.0)
    })

    await window.waitForTimeout(200)

    // Verify caption text is displayed but no word spans
    const captionText = window.locator('.caption-text')
    await expect(captionText).toHaveText('Hello world')

    const wordSpans = captionText.locator('.word-span')
    const wordCount = await wordSpans.count()
    expect(wordCount).toBe(0)
  })

  test('should preserve speaker metadata when splitting segment', async () => {
    // Load VTT with speaker and rating
    await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return

      const vttContent = `WEBVTT

NOTE CAPTION_EDITOR:TranscriptSegment {"id":"seg1","startTime":1,"endTime":5,"text":"First second third","words":[{"text":"First","startTime":1.0,"endTime":1.5},{"text":"second","startTime":2.0,"endTime":2.5},{"text":"third","startTime":3.0,"endTime":3.5}],"speakerName":"Bob","rating":5}

seg1
00:00:01.000 --> 00:00:05.000
First second third`

      vttStore.loadFromFile(vttContent, '/test/file.vtt')
      vttStore.setCurrentTime(2.0)
    })

    await window.waitForTimeout(200)

    // Split at word index 2 (before "third")
    const thirdWord = window.locator('.word-span[data-word-index="2"]')
    await thirdWord.click({ button: 'right' })

    await window.waitForTimeout(100)

    const splitMenuItem = window.locator('.context-menu-item')
    await splitMenuItem.click()

    await window.waitForTimeout(200)

    // Verify both segments have speaker and rating
    const segments = await window.evaluate(() => {
      const vttStore = (window as any).$store
      if (!vttStore) return null
      return vttStore.document.segments.map((seg: any) => ({
        text: seg.text,
        speakerName: seg.speakerName,
        rating: seg.rating
      }))
    })

    expect(segments).toHaveLength(2)
    expect(segments[0].speakerName).toBe('Bob')
    expect(segments[0].rating).toBe(5)
    expect(segments[1].speakerName).toBe('Bob')
    expect(segments[1].rating).toBe(5)
  })
})
