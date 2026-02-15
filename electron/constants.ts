/**
 * Central source of truth for app-wide constants and versions.
 */

// App Information
export const APP_VERSION = '1.3.18'

// AI Transcription (uvx / transcribe)
export const UV_VERSION = '0.10.2'
// NOTE: This hash must exist on GitHub because uvx fetches from ASR_GITHUB_REPO.
// Keep this pinned to a pushed commit that includes the `transcribe` packaging config.
export const ASR_COMMIT_HASH = '78eaf5545a5741fd1bf66a21e6a84e72ea7b4110'
export const ASR_GITHUB_REPO = 'git+https://github.com/thadd3us/caption_editor'
