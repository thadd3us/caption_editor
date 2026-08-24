import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import MediaPlayer from './MediaPlayer.vue'
import { useCaptionStore } from '../stores/captionStore'
import { usePreferencesStore } from '../stores/preferencesStore'

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

/** Seed two segments and park the playhead inside the first one. */
function seedStore() {
  const store = useCaptionStore()
  const firstId = store.addSegment(0, 10)
  const secondId = store.addSegment(10, 20)
  store.updateSegment(firstId, {
    text: 'hello world',
    words: [
      { text: 'hello', startTime: 0, endTime: 1 },
      { text: 'world', startTime: 1, endTime: 2 }
    ]
  })
  store.updateSegment(secondId, { text: 'second segment' })
  store.setCurrentTime(1)
  store.setIsDirty(false)
  return { store, firstId, secondId }
}

describe('MediaPlayer - editing the current caption', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorageMock.clear()
    delete (window as any).electronAPI
  })

  it('shows the word-span display, not an editor, until double-click', () => {
    seedStore()
    const wrapper = mount(MediaPlayer)

    expect(wrapper.find('.caption-text').exists()).toBe(true)
    expect(wrapper.find('[data-testid="caption-editor"]').exists()).toBe(false)
  })

  it('double-click opens an editor seeded with the current caption text', async () => {
    const { firstId } = seedStore()
    const wrapper = mount(MediaPlayer)

    await wrapper.find('.caption-text').trigger('dblclick')

    const editor = wrapper.find('[data-testid="caption-editor"]')
    expect(editor.exists()).toBe(true)
    expect((editor.element as HTMLTextAreaElement).value).toBe('hello world')
    // The word-span display is replaced while editing (it re-renders on every timeupdate).
    expect(wrapper.find('.caption-text').exists()).toBe(false)
    // Editing selects the matching row so the table agrees on the target.
    expect(useCaptionStore().selectedSegmentId).toBe(firstId)
  })

  it('Enter commits through updateSegment, marks verified, and realigns words', async () => {
    const { store, firstId } = seedStore()
    const wrapper = mount(MediaPlayer)

    await wrapper.find('.caption-text').trigger('dblclick')
    const editor = wrapper.find('[data-testid="caption-editor"]')
    await editor.setValue('hello cruel world')
    await editor.trigger('keydown', { key: 'Enter' })

    const segment = store.document.segments.find(s => s.id === firstId)!
    expect(segment.text).toBe('hello cruel world')
    expect(segment.verified).toBe(true)
    expect(store.isDirty).toBe(true)
    // Unchanged words keep their timestamps; the inserted word gets none.
    expect(segment.words?.map(w => [w.text, w.startTime])).toEqual([
      ['hello', 0],
      ['cruel', undefined],
      ['world', 1]
    ])
    expect(wrapper.find('[data-testid="caption-editor"]').exists()).toBe(false)
  })

  it('Shift+Enter does not commit', async () => {
    const { store, firstId } = seedStore()
    const wrapper = mount(MediaPlayer)

    await wrapper.find('.caption-text').trigger('dblclick')
    const editor = wrapper.find('[data-testid="caption-editor"]')
    await editor.setValue('not committed yet')
    await editor.trigger('keydown', { key: 'Enter', shiftKey: true })

    expect(wrapper.find('[data-testid="caption-editor"]').exists()).toBe(true)
    expect(store.document.segments.find(s => s.id === firstId)!.text).toBe('hello world')
  })

  it('double-clicking inside the open editor does not restart the edit', async () => {
    seedStore()
    const wrapper = mount(MediaPlayer)

    await wrapper.find('.caption-text').trigger('dblclick')
    const editor = wrapper.find('[data-testid="caption-editor"]')
    await editor.setValue('draft in progress')
    // Bubbles to the container's dblclick handler, which must be a no-op while editing.
    await editor.trigger('dblclick')

    expect((wrapper.find('[data-testid="caption-editor"]').element as HTMLTextAreaElement).value)
      .toBe('draft in progress')
  })

  it('Escape discards the edit', async () => {
    const { store, firstId } = seedStore()
    const wrapper = mount(MediaPlayer)

    await wrapper.find('.caption-text').trigger('dblclick')
    const editor = wrapper.find('[data-testid="caption-editor"]')
    await editor.setValue('discard me')
    await editor.trigger('keydown', { key: 'Escape' })

    expect(wrapper.find('[data-testid="caption-editor"]').exists()).toBe(false)
    expect(store.document.segments.find(s => s.id === firstId)!.text).toBe('hello world')
    expect(store.isDirty).toBe(false)
  })

  it('blur commits the edit', async () => {
    const { store, firstId } = seedStore()
    const wrapper = mount(MediaPlayer)

    await wrapper.find('.caption-text').trigger('dblclick')
    const editor = wrapper.find('[data-testid="caption-editor"]')
    await editor.setValue('committed on blur')
    await editor.trigger('blur')

    expect(store.document.segments.find(s => s.id === firstId)!.text).toBe('committed on blur')
  })

  it('commits to the segment the edit started on, even if the playhead moved on', async () => {
    const { store, firstId, secondId } = seedStore()
    const wrapper = mount(MediaPlayer)

    await wrapper.find('.caption-text').trigger('dblclick')
    const editor = wrapper.find('[data-testid="caption-editor"]')
    await editor.setValue('edited while playing')

    // Playback continues past the segment being edited.
    store.setCurrentTime(15)
    expect(store.currentSegment?.id).toBe(secondId)

    await editor.trigger('keydown', { key: 'Enter' })

    expect(store.document.segments.find(s => s.id === firstId)!.text).toBe('edited while playing')
    expect(store.document.segments.find(s => s.id === secondId)!.text).toBe('second segment')
  })

  it('leaves playback running while editing by default', async () => {
    const { store } = seedStore()
    store.setPlaying(true)

    const wrapper = mount(MediaPlayer)
    await wrapper.find('.caption-text').trigger('dblclick')

    expect(store.isPlaying).toBe(true)
  })

  it('pauses playback on edit when the preference is enabled', async () => {
    const { store } = seedStore()
    usePreferencesStore().setPreference('pausePlaybackWhileEditingCaption', true)
    store.setPlaying(true)

    const wrapper = mount(MediaPlayer)
    await wrapper.find('.caption-text').trigger('dblclick')

    expect(store.isPlaying).toBe(false)
  })
})
