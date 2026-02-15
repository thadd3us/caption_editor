/**
 * Central source of truth for app-wide constants and versions.
 */

// App Information
export const APP_VERSION = '1.3.15'

// AI Transcription (uvx / transcribe)
export const UV_VERSION = '0.7.12'
// NOTE: This hash must exist on GitHub because uvx fetches from ASR_GITHUB_REPO.
// Keep this pinned to a pushed commit that includes the `transcribe` packaging config.
export const ASR_COMMIT_HASH = 'f92e1acdfac255456dec46801cc7e2f303fb9896'
export const ASR_GITHUB_REPO = 'git+https://github.com/thadd3us/caption_editor'
