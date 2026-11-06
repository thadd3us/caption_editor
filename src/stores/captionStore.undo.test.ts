import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCaptionStore } from './captionStore'

/**
 * Undo/redo over the immutable document.
 *
 * The thing worth testing here is not that a stack pushes and pops, but that the
 * boundary of "what is an edit" matches the one `isDirty` already draws, and that
 * undoing back to the saved state leaves the document looking saved rather than
 * permanently edited.
 */
describe('captionStore - undo/redo', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function seed() {
    const store = useCaptionStore()
    store.loadFromFile(
      JSON.stringify({
        metadata: { id: 'undo-doc' },
        segments: [
          { id: 'a', startTime: 0, endTime: 1, text: 'first' },
          { id: 'b', startTime: 2, endTime: 3, text: 'second' },
        ],
      }),
      '/tmp/undo.captions_json5'
    )
    return store
  }

  it('starts with nothing to undo or redo', () => {
    const store = seed()
    expect(store.canUndo).toBe(false)
    expect(store.canRedo).toBe(false)
  })

  it('undoes a text edit and redoes it', () => {
    const store = seed()
    store.updateSegment('a', { text: 'edited' })
    expect(store.document.segments[0].text).toBe('edited')
    expect(store.canUndo).toBe(true)

    expect(store.undo()).toBe(true)
    expect(store.document.segments[0].text).toBe('first')
    expect(store.canRedo).toBe(true)

    expect(store.redo()).toBe(true)
    expect(store.document.segments[0].text).toBe('edited')
  })

  it('undoes a bulk delete, which is the case the Edit menu could not reach before', () => {
    const store = seed()
    store.bulkDeleteSegments(['a', 'b'])
    expect(store.document.segments).toHaveLength(0)

    store.undo()
    expect(store.document.segments.map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('walks back through several edits in order', () => {
    const store = seed()
    store.updateSegment('a', { text: 'one' })
    store.updateSegment('a', { text: 'two' })
    store.updateSegment('a', { text: 'three' })

    store.undo()
    expect(store.document.segments[0].text).toBe('two')
    store.undo()
    expect(store.document.segments[0].text).toBe('one')
    store.undo()
    expect(store.document.segments[0].text).toBe('first')
    expect(store.canUndo).toBe(false)
    expect(store.undo()).toBe(false)
  })

  it('drops the redo branch once a new edit is made', () => {
    const store = seed()
    store.updateSegment('a', { text: 'one' })
    store.undo()
    expect(store.canRedo).toBe(true)

    store.updateSegment('b', { text: 'different branch' })
    expect(store.canRedo).toBe(false)
  })

  it('restores the selection that was live when the edit happened', () => {
    const store = seed()
    store.selectSegment('b')
    store.updateSegment('b', { text: 'edited' })
    store.selectSegment('a')

    store.undo()
    expect(store.selectedSegmentId).toBe('b')
  })

  it('does not restore a selection whose segment no longer exists', () => {
    const store = seed()
    store.selectSegment('b')
    store.bulkDeleteSegments(['b'])
    // Deleting the selected row clears the selection; undo brings the row back.
    store.undo()
    expect(store.document.segments.map((s) => s.id)).toEqual(['a', 'b'])
  })

  /**
   * The interesting half of the feature. Undo is how a user says "I did not mean
   * that", and if the file keeps claiming unsaved changes afterwards they are
   * pushed into saving something they just rejected.
   */
  it('clears isDirty when undone back to the saved document', () => {
    const store = seed()
    expect(store.isDirty).toBe(false)

    store.updateSegment('a', { text: 'edited' })
    expect(store.isDirty).toBe(true)

    store.undo()
    expect(store.isDirty).toBe(false)
  })

  it('marks dirty again when redone away from the saved document', () => {
    const store = seed()
    store.updateSegment('a', { text: 'edited' })
    store.undo()
    store.redo()
    expect(store.isDirty).toBe(true)
  })

  it('treats the state at the last save as clean, not the state at load', () => {
    const store = seed()
    store.updateSegment('a', { text: 'edited' })
    store.markSaved()
    expect(store.isDirty).toBe(false)

    store.updateSegment('a', { text: 'edited again' })
    expect(store.isDirty).toBe(true)

    store.undo() // back to 'edited', which is what is on disk
    expect(store.isDirty).toBe(false)

    store.undo() // back to 'first', which is not
    expect(store.isDirty).toBe(true)
  })

  /**
   * `withoutDirtying()` marks replacements that are not content edits. The history
   * has to agree with that, or Cmd+Z after a Save As would silently revert the path.
   */
  it('does not record a non-content replacement', () => {
    const store = seed()
    store.updateFilePath('/tmp/somewhere-else.captions_json5')
    expect(store.canUndo).toBe(false)
    expect(store.isDirty).toBe(false)
  })

  it('forgets history when a different document is loaded', () => {
    const store = seed()
    store.updateSegment('a', { text: 'edited' })
    expect(store.canUndo).toBe(true)

    store.loadFromFile(
      JSON.stringify({
        metadata: { id: 'other-doc' },
        segments: [{ id: 'z', startTime: 0, endTime: 1, text: 'other' }],
      }),
      '/tmp/other.captions_json5'
    )

    // Undoing across the boundary would resurrect the first file's segments here.
    expect(store.canUndo).toBe(false)
    expect(store.canRedo).toBe(false)
  })

  it('forgets history on reset', () => {
    const store = seed()
    store.updateSegment('a', { text: 'edited' })
    store.reset()
    expect(store.canUndo).toBe(false)
  })

  it('bounds the stack so a long session cannot grow without limit', () => {
    const store = seed()
    for (let i = 0; i < 150; i++) {
      store.updateSegment('a', { text: `edit ${i}` })
    }
    // Still undoable, but not 150 deep.
    let depth = 0
    while (store.undo()) depth++
    expect(depth).toBe(100)
  })

  it('shares untouched arrays between history entries rather than copying them', () => {
    const store = seed()
    const segmentsBefore = store.document.segments
    store.updateTitle('a new title')

    // Only `title` changed, so the segments array should be the very same object —
    // this is what makes a history entry cheap enough to keep 100 of.
    expect(store.document.segments).toBe(segmentsBefore)
  })
})
