import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCaptionStore } from './captionStore'

/**
 * The cross-component state that used to travel as a `window` global and two DOM
 * CustomEvents. The point of these tests is the property the old arrangement could not
 * guarantee: the rows that get deleted are the rows the request named.
 */
describe('captionStore - selection and cross-component requests', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function seed() {
    const store = useCaptionStore()
    store.loadFromFile(
      JSON.stringify({
        metadata: { id: 'sel-doc' },
        segments: [
          { id: 'a', startTime: 0, endTime: 1, text: 'one' },
          { id: 'b', startTime: 2, endTime: 3, text: 'two' },
          { id: 'c', startTime: 4, endTime: 5, text: 'three' },
        ],
      }),
      '/tmp/sel.captions_json5'
    )
    return store
  }

  it('mirrors the grid selection, including the empty case', () => {
    const store = seed()
    expect(store.selectedSegmentIds).toEqual([])
    store.setSelectedSegmentIds(['a', 'c'])
    expect(store.selectedSegmentIds).toEqual(['a', 'c'])
    store.setSelectedSegmentIds([])
    expect(store.selectedSegmentIds).toEqual([])
  })

  it('has nothing pending until a deletion is requested', () => {
    const store = seed()
    expect(store.pendingDeletion).toBeNull()
    store.requestSegmentDeletion(['b'])
    expect(store.pendingDeletion).toEqual(['b'])
  })

  it('deletes exactly the rows the request named', () => {
    const store = seed()
    store.requestSegmentDeletion(['a', 'c'])
    store.confirmPendingDeletion()
    expect(store.document.segments.map((s) => s.id)).toEqual(['b'])
    expect(store.pendingDeletion).toBeNull()
  })

  /**
   * The failure the old global made possible: the dialog read whatever was on
   * `window` at confirm time, so a selection change between opening the dialog and
   * clicking Delete could retarget it.
   */
  it('is unaffected by the grid selection changing while the dialog is open', () => {
    const store = seed()
    store.requestSegmentDeletion(['a'])
    store.setSelectedSegmentIds(['b', 'c'])
    store.confirmPendingDeletion()
    expect(store.document.segments.map((s) => s.id)).toEqual(['b', 'c'])
  })

  it('takes a copy, so a caller mutating its array afterwards changes nothing', () => {
    const store = seed()
    const ids = ['a']
    store.requestSegmentDeletion(ids)
    ids.push('b')
    store.confirmPendingDeletion()
    expect(store.document.segments.map((s) => s.id)).toEqual(['b', 'c'])
  })

  it('cancelling deletes nothing', () => {
    const store = seed()
    store.requestSegmentDeletion(['a', 'b'])
    store.clearPendingDeletion()
    store.confirmPendingDeletion()
    expect(store.document.segments).toHaveLength(3)
  })

  it('counts speaker-similarity requests, so asking twice fires twice', () => {
    const store = seed()
    expect(store.speakerSimilarityRequest).toBe(0)
    store.requestSpeakerSimilaritySort()
    store.requestSpeakerSimilaritySort()
    expect(store.speakerSimilarityRequest).toBe(2)
  })
})
