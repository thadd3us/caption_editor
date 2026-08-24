import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import MediaPlayer from './MediaPlayer.vue'
import { useCaptionStore } from '../stores/captionStore'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = String(value) },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} }
  }
})()

global.localStorage = localStorageMock as any

/** One segment whose third word has no timestamp (as if it had just been typed in). */
function seedStore() {
  const store = useCaptionStore()
  const id = store.addSegment(0, 10)
  store.updateSegment(id, {
    text: 'alpha beta gamma',
    words: [
      { text: 'alpha', startTime: 0.5, endTime: 1 },
      { text: 'beta', startTime: 2.25, endTime: 3 },
      { text: 'gamma' }
    ]
  })
  store.setCurrentTime(0.6)
  return { store, id }
}

describe('MediaPlayer - clicking a word seeks the playhead', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorageMock.clear()
    delete (window as any).electronAPI
  })

  it('moves the playhead to a timed word', async () => {
    const { store } = seedStore()
    const wrapper = mount(MediaPlayer)

    await wrapper.findAll('.word-span')[1].trigger('click', { detail: 1 })

    expect(store.currentTime).toBe(2.25)
  })

  it('ignores words with no timestamp', async () => {
    const { store } = seedStore()
    const wrapper = mount(MediaPlayer)

    await wrapper.findAll('.word-span')[2].trigger('click', { detail: 1 })

    expect(store.currentTime).toBe(0.6)
  })

  it('does not seek on the second click of a double-click (which opens the editor)', async () => {
    const { store } = seedStore()
    const wrapper = mount(MediaPlayer)

    // detail === 2 is the double-click's second click; the first (detail 1) still seeks.
    await wrapper.findAll('.word-span')[1].trigger('click', { detail: 2 })

    expect(store.currentTime).toBe(0.6)
  })

  it('ignores clicks on the caption box that are not on a word', async () => {
    const { store } = seedStore()
    const wrapper = mount(MediaPlayer)

    await wrapper.find('.caption-text').trigger('click', { detail: 1 })

    expect(store.currentTime).toBe(0.6)
  })
})
