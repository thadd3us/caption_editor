/**
 * Central source of truth for app-wide constants and versions.
 */

// App Information
export const APP_VERSION = '1.5.22'

// AI Transcription (uvx / transcribe)
export const UV_VERSION = '0.10.4'
// Revision passed to `uvx …@${ASR_COMMIT_HASH}` (must exist on GitHub). Also used for
// `.captions_json5` schema blob URLs; keep identical to `ASR_COMMIT_HASH` in
// transcribe/constants.py.
//
// Git reality: a commit’s tree cannot contain its *own* commit id (the id hashes the
// tree). So after a “bump version” commit A, commit B updates these files to say A.
// The checkout *at A* still has the *previous* hash inside transcribe/constants.py —
// that is fine: the app does not read that file to choose the fetch rev; Electron
// passes this constant. For CLI-only runs, use `main` after B (or match this pin).
export const ASR_COMMIT_HASH = '73d21a8a2276879beb94bddad245f09f6d501a00'
export const ASR_GITHUB_REPO = 'git+https://github.com/thadd3us/caption_editor'
