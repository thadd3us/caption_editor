import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  DEFAULT_PREFERENCES,
  sanitizePreferences,
  type AppPreferences
} from '../types/preferences'

/**
 * App-wide user preferences (see `src/types/preferences.ts`).
 *
 * Separate from `useCaptionStore()` on purpose: that store's `reset()` clears everything for a
 * new document, and preferences must survive that.
 *
 * Storage: `window.electronAPI.preferences` (userData file) in Electron, `localStorage` in a
 * plain browser / unit tests.
 */
const LOCAL_STORAGE_KEY = 'caption-editor-preferences'

function loadPreferences(): AppPreferences {
  const api = window.electronAPI?.preferences
  if (api) {
    return sanitizePreferences(api.getSync())
  }
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
    return sanitizePreferences(raw ? JSON.parse(raw) : null)
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

function persistPreferences(preferences: AppPreferences) {
  const api = window.electronAPI?.preferences
  if (api) {
    api.set({ ...preferences })?.catch?.((err: unknown) => {
      console.error('[preferences] Failed to persist preferences:', err)
    })
    return
  }
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(preferences))
  } catch (err) {
    console.error('[preferences] Failed to persist preferences:', err)
  }
}

export const usePreferencesStore = defineStore('preferences', () => {
  const preferences = ref<AppPreferences>(loadPreferences())

  function setPreference<K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) {
    console.log('[preferences] Setting', key, '=', value)
    preferences.value = { ...preferences.value, [key]: value }
    persistPreferences(preferences.value)
  }

  /** Adopt values changed in another window (no re-persist — that window already wrote them). */
  function adoptExternalPreferences(raw: unknown) {
    preferences.value = sanitizePreferences(raw)
  }

  /** Re-read from storage. Used by tests; harmless elsewhere. */
  function reloadPreferences() {
    preferences.value = loadPreferences()
  }

  return {
    preferences,
    setPreference,
    adoptExternalPreferences,
    reloadPreferences
  }
})
