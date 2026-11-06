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

/**
 * `.video-container` is `flex: 1`, which is right for video and wrong for audio: a ~54px
 * `<audio>` element was sitting in the middle of a 596px black box (measured at a 900px-tall
 * window) while the caption panel underneath — the thing you actually read and edit in —
 * got the 120px `captionHeight` default.
 *
 * The `audio-only` class is what switches the layout, so these tests pin the class and the
 * two things that hang off it: the drag handle goes away (there is nothing above to take
 * height from) and the caption box drops its inline height so flex can give it the slack.
 * Heights themselves are not asserted — happy-dom does no layout.
 */
describe('MediaPlayer - audio-only layout', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorageMock.clear()
    delete window.electronAPI
  })

  function mountWith(mediaPath: string | null) {
    const store = useCaptionStore()
    if (mediaPath) store.loadMediaFile(mediaPath, mediaPath)
    return mount(MediaPlayer)
  }

  it.each([
    'media://local/x/interview.mp3',
    'media://local/x/take-1.wav',
    'media://local/x/voice.m4a',
    'media://local/x/lossless.flac',
  ])('treats %s as audio-only', (path) => {
    const wrapper = mountWith(path)
    expect(wrapper.find('.media-player').classes()).toContain('audio-only')
    expect(wrapper.find('audio').exists()).toBe(true)
  })

  it.each([
    'media://local/x/clip.mp4',
    'media://local/x/clip.webm',
    'media://local/x/clip.mov',
  ])('does not treat %s as audio-only', (path) => {
    const wrapper = mountWith(path)
    expect(wrapper.find('.media-player').classes()).not.toContain('audio-only')
    expect(wrapper.find('video').exists()).toBe(true)
  })

  it('is not audio-only before any media is loaded', () => {
    const wrapper = mountWith(null)
    expect(wrapper.find('.media-player').classes()).not.toContain('audio-only')
  })

  it('drops the caption resizer and the inline height for audio', () => {
    const wrapper = mountWith('media://local/x/interview.mp3')
    expect(wrapper.find('.caption-resizer').exists()).toBe(false)
    // No inline height, so `.media-player.audio-only .current-caption-display { flex: 1 }`
    // is free to hand it the space the video box gave up.
    expect(wrapper.find('.current-caption-display').attributes('style')).toBeUndefined()
  })

  it('keeps the resizer and the stored captionHeight for video', () => {
    const store = useCaptionStore()
    store.captionHeight = 240
    store.loadMediaFile('media://local/x/clip.mp4', '/x/clip.mp4')
    const wrapper = mount(MediaPlayer)

    expect(wrapper.find('.caption-resizer').exists()).toBe(true)
    expect(wrapper.find('.current-caption-display').attributes('style')).toContain('height: 240px')
  })

  it('leaves captionHeight untouched while audio is open, so video gets it back', () => {
    const store = useCaptionStore()
    store.captionHeight = 240
    mount(MediaPlayer)
    store.loadMediaFile('media://local/x/interview.mp3', '/x/interview.mp3')
    expect(store.captionHeight).toBe(240)
  })
})
