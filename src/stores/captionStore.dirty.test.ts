/**
 * Dirty-bit semantics.
 *
 * The distinction this file pins down:
 *   - `isDirty`  → the transcript differs from disk. Prompts before discarding.
 *   - `viewDirty` → only view state changed (layout, filters, playhead, selection).
 *                   Saved quietly on close, never prompts.
 *
 * `isDirty` is produced by a single watcher on the immutable document, so the point
 * of the table below is to prove every action lands on the intended side of that line.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCaptionStore } from './captionStore'

const MEDIA_PATH = '/media/interview.wav'

function docJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    metadata: { id: 'doc-1', mediaFilePath: MEDIA_PATH },
    segments: [
      { id: 'seg-1', index: 0, startTime: 0, endTime: 5, text: 'First' },
      { id: 'seg-2', index: 1, startTime: 5, endTime: 10, text: 'Second' }
    ],
    ...overrides
  })
}

describe('captionStore dirty tracking', () => {
  beforeEach(() => setActivePinia(createPinia()))

  describe('content edits mark the document dirty', () => {
    const contentEdits: Array<[string, (store: ReturnType<typeof useCaptionStore>) => void]> = [
      ['addSegment', (s) => s.addSegment(20, 5)],
      ['updateSegment', (s) => s.updateSegment('seg-1', { text: 'Changed' })],
      ['deleteSegment', (s) => s.deleteSegment('seg-1')],
      ['renameSpeaker', (s) => s.renameSpeaker('Alice', 'Bob')],
      ['bulkSetSpeaker', (s) => s.bulkSetSpeaker(['seg-1'], 'Carol')],
      ['bulkSetVerified', (s) => s.bulkSetVerified(['seg-1'], true)],
      ['bulkSetRating', (s) => s.bulkSetRating(['seg-1'], 4)],
      ['bulkDeleteSegments', (s) => s.bulkDeleteSegments(['seg-1'])],
      ['mergeAdjacentSegments', (s) => s.mergeAdjacentSegments(['seg-1', 'seg-2'])],
      ['updateTitle', (s) => s.updateTitle('New title')],
      ['loadMediaFile (new attachment)', (s) => s.loadMediaFile('media:///other.wav', '/other.wav')]
    ]

    for (const [name, edit] of contentEdits) {
      it(`${name} → dirty`, () => {
        const store = useCaptionStore()
        store.loadFromFile(docJson(), '/docs/a.captions_json5')
        expect(store.isDirty).toBe(false)

        edit(store)
        expect(store.isDirty).toBe(true)
      })
    }
  })

  describe('view-only changes never mark the document dirty', () => {
    const viewChanges: Array<[string, (store: ReturnType<typeof useCaptionStore>) => void]> = [
      ['setCurrentTime', (s) => s.setCurrentTime(7.5)],
      ['selectSegment', (s) => s.selectSegment('seg-2')],
      ['leftPanelWidth drag', (s) => { s.leftPanelWidth = 42 }],
      ['captionHeight drag', (s) => { s.captionHeight = 200 }]
    ]

    for (const [name, change] of viewChanges) {
      it(`${name} → view-dirty only`, () => {
        const store = useCaptionStore()
        store.loadFromFile(docJson(), '/docs/a.captions_json5')

        change(store)
        expect(store.isDirty).toBe(false)
        expect(store.viewDirty).toBe(true)
      })
    }

    it('markViewDirty does not escalate to a content edit', () => {
      const store = useCaptionStore()
      store.loadFromFile(docJson(), '/docs/a.captions_json5')
      store.markViewDirty()
      expect(store.isDirty).toBe(false)
      expect(store.viewDirty).toBe(true)
    })
  })

  describe('opening a document leaves it clean', () => {
    it('loadFromFile starts clean', () => {
      const store = useCaptionStore()
      store.loadFromFile(docJson(), '/docs/a.captions_json5')
      expect(store.isDirty).toBe(false)
      expect(store.viewDirty).toBe(false)
    })

    it('auto-loading the media the document already references does NOT dirty it', () => {
      // Regression: media auto-load used to rewrite metadata.mediaFilePath with the
      // identical path, so every document with media went dirty seconds after opening
      // and quitting produced a spurious "unsaved changes" prompt.
      const store = useCaptionStore()
      store.loadFromFile(docJson(), '/docs/a.captions_json5')

      store.loadMediaFile(`media://${MEDIA_PATH}`, MEDIA_PATH)

      expect(store.mediaPath).toBe(`media://${MEDIA_PATH}`)
      expect(store.isDirty).toBe(false)
    })

    it('attaching a different media file DOES dirty it', () => {
      const store = useCaptionStore()
      store.loadFromFile(docJson(), '/docs/a.captions_json5')

      store.loadMediaFile('media:///media/other.wav', '/media/other.wav')
      expect(store.isDirty).toBe(true)
    })

    it('attaching media to an empty session is a real unsaved change', () => {
      // This is the case the old `segments.length > 0` guard silently discarded.
      const store = useCaptionStore()
      expect(store.isDirty).toBe(false)

      store.loadMediaFile(`media://${MEDIA_PATH}`, MEDIA_PATH)
      expect(store.isDirty).toBe(true)
      expect(store.document.segments).toHaveLength(0)
    })

    it('updateFilePath is not a content edit', () => {
      // filePath is runtime-only and never serialized, so Save As must not leave the
      // document looking edited immediately after it was saved.
      const store = useCaptionStore()
      store.loadFromFile(docJson(), '/docs/a.captions_json5')
      store.updateFilePath('/docs/b.captions_json5')
      expect(store.isDirty).toBe(false)
    })
  })

  describe('markSaved', () => {
    it('clears both flags', () => {
      const store = useCaptionStore()
      store.loadFromFile(docJson(), '/docs/a.captions_json5')
      store.addSegment(20, 5)
      store.setCurrentTime(3)
      expect(store.isDirty).toBe(true)
      expect(store.viewDirty).toBe(true)

      store.markSaved()
      expect(store.isDirty).toBe(false)
      expect(store.viewDirty).toBe(false)
    })

    it('setIsDirty(false) is equivalent to markSaved', () => {
      const store = useCaptionStore()
      store.loadFromFile(docJson(), '/docs/a.captions_json5')
      store.setCurrentTime(3)
      store.setIsDirty(false)
      expect(store.viewDirty).toBe(false)
    })
  })
})
