/**
 * Central source of truth for app-wide constants and versions.
 */

// App Information
export const APP_VERSION = '1.3.23'

// AI Transcription (uvx / transcribe)
export const UV_VERSION = '0.10.4'
// NOTE: This hash must exist on GitHub because uvx fetches from ASR_GITHUB_REPO.
// Keep this pinned to a pushed commit that includes the `transcribe` packaging config.
export const ASR_COMMIT_HASH = 'e08089fadc8796dcf4616a25a3a8e93cf6b527f4'
export const ASR_GITHUB_REPO = 'git+https://github.com/thadd3us/caption_editor'
