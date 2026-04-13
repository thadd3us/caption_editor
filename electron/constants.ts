/**
 * Central source of truth for app-wide constants and versions.
 */

// App Information
export const APP_VERSION = '1.5.4'

// AI Transcription (uvx / transcribe)
export const UV_VERSION = '0.10.4'
// NOTE: This hash must exist on GitHub because uvx fetches from ASR_GITHUB_REPO.
// Keep this pinned to a pushed commit that includes the `transcribe` packaging config.
export const ASR_COMMIT_HASH = 'c82453b013669cf4c04ac664413d430221d4b875'
export const ASR_GITHUB_REPO = 'git+https://github.com/thadd3us/caption_editor'
