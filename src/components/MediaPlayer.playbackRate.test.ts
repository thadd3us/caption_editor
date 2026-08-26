import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import MediaPlayer from './MediaPlayer.vue'
import { useCaptionStore } from '../stores/captionStore'
import { PLAYBACK_RATE_OPTIONS, nearestPlaybackRate } from '../types/schema'

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
 * jsdom's HTMLMediaElement has no real decoder: `duration` is NaN and `loadedmetadata` never
 * fires on its own. The component only ever reaches the element through `videoElement` /
 * `audioElement`, so mounting with a media path and firing the event by hand exercises the same
 * code path the browser would.
 */
function mountWithMedia() {
  const store = useCaptionStore()
  store.loadMediaFile('media://fixture.mp4')
  const wrapper = mount(MediaPlayer)
  return { store, wrapper, video: wrapper.find('video') }
}

describe('MediaPlayer - playback speed', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorageMock.clear()
    delete (window as any).electronAPI
  })

  it('offers the documented speeds and starts at 1x', () => {
    const { wrapper } = mountWithMedia()

    const select = wrapper.find('[data-testid="playback-speed"]')
    expect(select.exists()).toBe(true)
    expect(select.findAll('option').map(o => o.attributes('value')))
      .toEqual(PLAYBACK_RATE_OPTIONS.map(String))
    expect((select.element as HTMLSelectElement).value).toBe('1')
  })

  it('labels rates compactly', () => {
    const { wrapper } = mountWithMedia()

    const labels = wrapper.find('[data-testid="playback-speed"]')
      .findAll('option').map(o => o.text())
    expect(labels).toContain('1x')
    expect(labels).toContain('0.75x')
    expect(labels).toContain('1.25x')
  })

  it('choosing a speed applies it to the media element and stores it on the document', async () => {
    const { store, wrapper, video } = mountWithMedia()

    await wrapper.find('[data-testid="playback-speed"]').setValue('1.5')

    expect((video.element as HTMLVideoElement).playbackRate).toBe(1.5)
    expect(store.playbackRate).toBe(1.5)
  })

  it('is view state: changing speed never raises the unsaved-changes prompt', async () => {
    const { store, wrapper } = mountWithMedia()
    store.setIsDirty(false)

    await wrapper.find('[data-testid="playback-speed"]').setValue('0.5')

    // Content is untouched, so quitting must not prompt — only the quiet view-state save fires.
    expect(store.isDirty).toBe(false)
    expect(store.viewDirty).toBe(true)
  })

  it('re-applies the chosen speed when a source finishes loading', async () => {
    const { store, video } = mountWithMedia()
    store.playbackRate = 0.75
    const element = video.element as HTMLVideoElement

    // A newly loaded source always comes back at 1x; `loadedmetadata` is where we fix that.
    element.playbackRate = 1
    await video.trigger('loadedmetadata')

    expect(element.playbackRate).toBe(0.75)
    expect(element.defaultPlaybackRate).toBe(0.75)
  })

  it('adopts a rate the native controls overlay set behind our back', async () => {
    const { store, video } = mountWithMedia()
    const element = video.element as HTMLVideoElement

    // Chromium's `controls` overlay has its own speed submenu; it writes the property directly.
    element.playbackRate = 1.5
    await video.trigger('ratechange')

    expect(store.playbackRate).toBe(1.5)
  })

  it('snaps a rate the overlay set to a value we do not offer', async () => {
    const { store, video } = mountWithMedia()
    const element = video.element as HTMLVideoElement

    element.playbackRate = 1.4
    await video.trigger('ratechange')

    expect(store.playbackRate).toBe(1.5)
  })

  it('does not loop when it applies a rate to the element itself', async () => {
    const { store, wrapper, video } = mountWithMedia()

    // The <select> -> store -> element hop fires `ratechange`, which must settle, not ping-pong.
    await wrapper.find('[data-testid="playback-speed"]').setValue('0.5')
    await video.trigger('ratechange')

    expect(store.playbackRate).toBe(0.5)
    expect((video.element as HTMLVideoElement).playbackRate).toBe(0.5)
  })

  it('disables the selector with no media loaded', () => {
    const wrapper = mount(MediaPlayer)
    expect(wrapper.find('[data-testid="playback-speed"]').attributes('disabled')).toBeDefined()
  })
})

describe('playback rate persistence in uiState', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    delete (window as any).electronAPI
  })

  function loadDoc(uiState: Record<string, unknown> | undefined) {
    const store = useCaptionStore()
    store.loadFromFile(JSON.stringify({
      metadata: { id: 'rate-doc' },
      segments: [{ id: 's1', startTime: 0, endTime: 5, text: 'hi' }],
      ...(uiState ? { uiState } : {})
    }), '/test/rate-doc.captions_json5')
    return store
  }

  it('restores a saved rate and writes it back out', () => {
    const store = loadDoc({ playbackRate: 1.25 })
    expect(store.playbackRate).toBe(1.25)

    const reloaded = JSON.parse(store.exportToString().replace(/^\/\/.*$/gm, ''))
    expect(reloaded.uiState.playbackRate).toBe(1.25)
  })

  it('defaults to 1x for a document written before the setting existed', () => {
    expect(loadDoc(undefined).playbackRate).toBe(1.0)
  })

  it('does not trust an off-list rate from a hand-edited file', () => {
    // Otherwise the <select> would show no matching option and the user could not get back to 1x.
    expect(loadDoc({ playbackRate: 8 }).playbackRate).toBe(2.0)
    expect(loadDoc({ playbackRate: -3 }).playbackRate).toBe(0.25)
    expect(loadDoc({ playbackRate: 1.3 }).playbackRate).toBe(1.25)
  })

  it('leaves every offered option untouched by snapping', () => {
    expect(PLAYBACK_RATE_OPTIONS).toContain(1.0)
    for (const rate of PLAYBACK_RATE_OPTIONS) {
      expect(nearestPlaybackRate(rate)).toBe(rate)
    }
  })

  it('opening a different document resets the rate rather than carrying it over', () => {
    const store = loadDoc({ playbackRate: 1.75 })
    expect(store.playbackRate).toBe(1.75)

    loadDoc({ captionHeight: 200 })
    expect(store.playbackRate).toBe(1.0)
  })
})
