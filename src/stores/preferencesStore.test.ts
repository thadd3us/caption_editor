import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePreferencesStore } from './preferencesStore'
import { DEFAULT_PREFERENCES, sanitizePreferences } from '../types/preferences'

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

describe('sanitizePreferences', () => {
  it('returns defaults for null / garbage input', () => {
    expect(sanitizePreferences(null)).toEqual(DEFAULT_PREFERENCES)
    expect(sanitizePreferences('nope')).toEqual(DEFAULT_PREFERENCES)
    expect(sanitizePreferences(42)).toEqual(DEFAULT_PREFERENCES)
  })

  it('drops unknown keys and wrong-typed values', () => {
    const result = sanitizePreferences({
      pausePlaybackWhileEditingCaption: 'yes please',
      somethingRemovedInAnOlderVersion: true
    })
    expect(result).toEqual(DEFAULT_PREFERENCES)
    expect(result).not.toHaveProperty('somethingRemovedInAnOlderVersion')
  })

  it('keeps valid values', () => {
    expect(sanitizePreferences({ pausePlaybackWhileEditingCaption: true }))
      .toEqual({ pausePlaybackWhileEditingCaption: true })
  })
})

describe('usePreferencesStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorageMock.clear()
    delete (window as any).electronAPI
  })

  it('starts from defaults when nothing is persisted', () => {
    const prefs = usePreferencesStore()
    expect(prefs.preferences).toEqual(DEFAULT_PREFERENCES)
  })

  it('persists to localStorage outside Electron and reloads it', () => {
    const prefs = usePreferencesStore()
    prefs.setPreference('pausePlaybackWhileEditingCaption', true)

    expect(JSON.parse(localStorage.getItem('caption-editor-preferences')!))
      .toEqual({ pausePlaybackWhileEditingCaption: true })

    prefs.reloadPreferences()
    expect(prefs.preferences.pausePlaybackWhileEditingCaption).toBe(true)
  })

  it('reads and writes through electronAPI when available', () => {
    const set = vi.fn().mockResolvedValue(undefined)
    ;(window as any).electronAPI = {
      preferences: {
        getSync: () => ({ pausePlaybackWhileEditingCaption: true }),
        set,
        onChanged: vi.fn()
      }
    }

    const prefs = usePreferencesStore()
    expect(prefs.preferences.pausePlaybackWhileEditingCaption).toBe(true)

    prefs.setPreference('pausePlaybackWhileEditingCaption', false)
    expect(set).toHaveBeenCalledWith({ pausePlaybackWhileEditingCaption: false })
    // Electron path must not fall back to localStorage
    expect(localStorage.getItem('caption-editor-preferences')).toBeNull()
  })

  it('adopts external changes without re-persisting', () => {
    const prefs = usePreferencesStore()
    prefs.adoptExternalPreferences({ pausePlaybackWhileEditingCaption: true })

    expect(prefs.preferences.pausePlaybackWhileEditingCaption).toBe(true)
    expect(localStorage.getItem('caption-editor-preferences')).toBeNull()
  })
})
