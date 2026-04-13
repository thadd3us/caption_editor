/**
 * Central source of truth for app-wide constants and versions.
 */

// App Information
export const APP_VERSION = '1.5.6'

// AI Transcription (uvx / transcribe)
export const UV_VERSION = '0.10.4'
// NOTE: This hash must exist on GitHub because uvx fetches from ASR_GITHUB_REPO.
// Keep this pinned to a pushed commit that includes the `transcribe` packaging config.
// Also used in `.captions_json5` file headers (schema doc links) and must stay in
// sync with the same symbol in transcribe/constants.py.
export const ASR_COMMIT_HASH = 'fa3fc769dd899b569cae16a39f88dde9d4a4b63c'
export const ASR_GITHUB_REPO = 'git+https://github.com/thadd3us/caption_editor'
