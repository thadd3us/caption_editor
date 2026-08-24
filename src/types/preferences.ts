/**
 * Application preferences: user settings that persist across documents and launches.
 *
 * These are deliberately *not* part of `CaptionsDocument` / `UIState` — those travel with a
 * `.captions_json5` file, while preferences belong to the person using the app. Persistence
 * lives in `userData/preferences.json` (see `electron/main.ts`), because `localStorage` is
 * unreliable for packaged `file://` loads — the same reason license acceptance is stored there.
 *
 * This module is imported by BOTH the Electron main process and the renderer, so it must stay
 * dependency-free.
 */
export interface AppPreferences {
  /**
   * When you start editing the caption in the media panel, pause playback.
   *
   * Default `false`: editing pins the segment being edited, so playback can continue while you
   * correct the text — useful for listening to the audio you are transcribing.
   */
  pausePlaybackWhileEditingCaption: boolean
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  pausePlaybackWhileEditingCaption: false
}

/**
 * Coerce arbitrary parsed JSON into a valid `AppPreferences`.
 *
 * Unknown keys are dropped and wrong-typed / missing values fall back to the default, so a
 * hand-edited or older `preferences.json` can never put the app into a broken state.
 */
export function sanitizePreferences(raw: unknown): AppPreferences {
  const source = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
  const result = { ...DEFAULT_PREFERENCES }
  for (const key of Object.keys(DEFAULT_PREFERENCES) as (keyof AppPreferences)[]) {
    const value = source[key]
    if (typeof value === typeof DEFAULT_PREFERENCES[key]) {
      result[key] = value as AppPreferences[typeof key]
    }
  }
  return result
}
