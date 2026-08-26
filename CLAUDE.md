# Claude Development Notes

## Important Reminders

**DO NOT create summary/readme files like CLUSTERING_README.md, IMPLEMENTATION_SUMMARY.md, etc.**
- Just update this CLAUDE.md file with notes
- Users can read the code and tests to understand features

## Development Workflow

### Version Management

**IMPORTANT: When changing Node.js/TypeScript code, bump the Electron app version!**

1. **`APP_VERSION`** — Declared in three files that MUST stay in lockstep
   (enforced by `//tools/bazel:version_consistency_test`):
   - `electron/constants.ts`: `export const APP_VERSION = '1.6.1'`
   - `transcribe_rs/version.bzl`: `APP_VERSION = "1.6.1"` (used by BUILD.bazel files to stamp `CARGO_PKG_VERSION` so the Rust binaries' `--version` flag matches)
   - `transcribe_rs/Cargo.toml`: `workspace.package.version = "1.6.1"` (used when building via `cargo` outside Bazel)

   The GitHub Release workflow attaches the Rust binaries as `transcribe-rs-v${APP_VERSION}-darwin-arm64` and `embed-rs-v${APP_VERSION}-darwin-arm64`. The Electron app downloads by version tag.

2. **`ASR_COMMIT_HASH`** — *Deprecated, used during the Python→Rust migration.* Same string in `electron/constants.ts` and `transcribe/constants.py`. This is the revision **Electron passes to `uvx`** (must be on GitHub with a working `transcribe/` package). It is also baked into `.captions_json5` header blob URLs when the app or CLI serializes a file.

**Why the pin can’t match “this” commit’s tree:** A git commit id is the hash of that commit’s tree. The tree cannot truthfully contain its own commit id as file text (changing the text would change the tree and thus the id). So the usual release is **two commits**: commit **A** bumps `APP_VERSION`; commit **B** sets `ASR_COMMIT_HASH` to **A**’s hash in both files. The tarball **at A** still has the *previous* `ASR_COMMIT_HASH` inside `transcribe/constants.py` — that does **not** break production: uvx uses the rev from **Electron**, not from Python’s constant. For local `uv run transcribe_cli` with headers matching the pin, work from `main` **after B** (or accept one-commit lag on a checkout exactly at **A**).

The two-step workflow:
```bash
# 1. Bump APP_VERSION, commit, and push
git add -A && git commit -m "Bump version to X.Y.Z"
git push
# 2. Set ASR_COMMIT_HASH to the hash of commit 1 (not “this” commit’s hash), in BOTH files
git rev-parse HEAD  # after step 1, this is commit A — copy for ASR_COMMIT_HASH
# edit ASR_COMMIT_HASH in electron/constants.ts AND transcribe/constants.py
git add -A && git commit -m "Update ASR_COMMIT_HASH to vX.Y.Z"
git push
```

### Committing Work

**Always commit your work when you reach a good checkpoint:**
- Tests are passing
- Code is in a working state
- A logical unit of work is complete

```bash
npm run test:unit
DISPLAY=:99 npx playwright test tests/electron/
git add -A
git commit -m "Your message" --trailer "Co-authored-by: Sculptor <sculptor@imbue.com>"
```

## Testing

**Agents:** Prefer Bazel for Rust tests — not `cargo test`. See [AGENTS.md](AGENTS.md).

### Quick Start

```bash
# Run all tests (canonical entrypoint — TS + Electron + Python, cached).
# Superset of what CI runs: this also runs the `requires-torch` heavy
# transcribe tests. See AGENTS.md → "Continuous integration".
bazelisk test //...

# Coverage
bazelisk coverage //transcribe/...   # Python lcov at bazel-out/_coverage/_coverage_report.dat
bazelisk run //:ts_vitest_coverage   # TS unit coverage at coverage/
bazelisk run //:ts_full_coverage     # TS unit + e2e coverage via vite-plugin-istanbul + nyc

# Rust (transcribe_rs/) — use Bazel, not cargo (cached; matches CI)
bazelisk test //transcribe_rs/caption-core:caption_core_test
bazelisk test //transcribe_rs/caption-core:post_processing_pipeline

# Inner-loop suites (no Bazel — keep host node_modules / .venv warm)
npm test                    # Unit tests (watch mode)
npm run test:unit           # Unit tests (once)
bazelisk test //:e2e_playwright              # E2E default (excludes @expensive specs)
bazelisk test //:e2e_playwright_expensive  # ASR/ML e2e (manual tag)
npm run test:e2e            # Same default filter as //:e2e_playwright (auto-builds)
cd transcribe && uv run pytest tests/ -v  # Python tests

# Run specific test file
npx playwright test tests/electron/file-save.electron.spec.ts
npm test src/utils/findIndexOfRowForTime.test.ts
```

### Test Status

Saved/exported `.captions_json5` from `exportToString()` includes leading `//` header comments. In Playwright specs, parse with `parseCaptionsFileContent()` from `tests/helpers/parseCaptionsFileContent.ts` (JSON5), not `JSON.parse`.

### ASR post-processing without running models

**Already in place:** `transcribe/asr_results_to_captions_post_processing_pipeline_test.py` loads captured chunked raw output from `transcribe/test_fixtures/` (Whisper and Parakeet, 10s and 60s chunk sizes), parses chunks into `ASRSegment` lists, and runs the production pipeline via `post_process_asr_segments()` (which delegates to `post_process_raw_asr_segments()` then transcript conversion). Snapshots lock the resulting segment boundaries and text. No GPU, no `@pytest.mark.expensive` ASR runs.

**Opportunity:** When overlap merge or gap/long-segment logic misbehaves on real audio, add a **fixture-driven** regression: capture raw chunked ASR (e.g. `transcribe/capture_raw_asr_output.py`, or copy `rawAsrOutput` from a `.captions_json5` produced by transcription), drop JSON under `test_fixtures/`, and add a parametrized case or a dedicated test that calls `post_process_raw_asr_segments()` / `post_process_asr_segments()` with the same `chunk_size`, `overlap`, and gap thresholds as production. That isolates post-processing bugs from model noise and keeps CI fast.

**Syrupy (`.ambr`):** Most transcribe snapshot tests use the default fixture from `transcribe/conftest.py` (one `.ambr` file per test module under `transcribe/__snapshots__/`). `asr_results_to_captions_post_processing_pipeline_test.py` uses a per-parametrized-case file and applies `snapshot(matcher=rounded_floats_matcher(...))` from `transcribe/snapshot_test_utils.py` so **floats are rounded during serialization**—values stay visible in the Amber file but tiny FP jitter does not fail CI. To **drop** keys entirely from snapshots, use `snapshot(exclude=syrupy.filters.paths("a.b", ...))` instead.

### Platform Notes

- **macOS**: All tests work out of the box
- **Linux/Docker**: E2E tests need Xvfb (auto-starts in devcontainer)
  - If Xvfb dies: `pkill Xvfb && pkill -9 electron && start-xvfb.sh`
  - Tests need `DISPLAY=:99` in Linux environments

## Architecture Essentials

### State Management
- Pinia store (`captionStore.ts` / `useCaptionStore()`)
- Immutable document model
- Segments always sorted by start/end time

### Dirty tracking and view state

Two flags in `captionStore.ts`, with deliberately different policies:

- **`isDirty` (content)** — the transcript differs from disk (segments, speakers, title,
  media attachment). Prompts before quit / open / drop. Set in **exactly one place**: a
  `flush: 'sync'` watcher on `document`. The document model is immutable, so every
  mutating action replaces `document.value` wholesale — do **not** add per-action
  `isDirty = true` lines. Use `withoutDirtying()` for replacements that are not content
  edits (e.g. `updateFilePath`, since `filePath` is runtime-only and never serialized).
- **`viewDirty`** — only view state changed. Saved quietly on window close
  (`saveViewStateQuietly()` in App.vue), **never** prompts. Scrolling or sorting must not
  produce an "unsaved changes" dialog.

`markSaved()` clears both; call it wherever memory comes to match disk.

**Everything the user can adjust *about a document* lives in `uiState`** and round-trips with
it (app-level settings that are not a property of any document go in **Preferences** instead —
see the decision rule there):
`columnState`, `filterModel`, `leftPanelWidth`, `captionHeight`, `playheadSeconds`,
`selectedSegmentId`, `playbackRate`. Selection is keyed by **segment UUID**, not row index, so it
survives sorting, filtering, and edits. The playhead is restored in
`MediaPlayer.onMediaLoaded()` — the earliest point the element accepts a seek.

**⚠️ `uiState` fields must be added in all three schemas** (`src/types/schema.ts`,
`transcribe/schema.py`, `transcribe_rs/caption-schema/src/lib.rs`). Both pydantic and
serde drop unknown fields, and `embed-rs` / `embed_cli` rewrite the whole document — a
TS-only field would be silently erased by "Compute Speaker Embeddings". Guarded by
`transcribe/ui_state_round_trip_test.py` and `ui_state_survives_round_trip` in the Rust
crate.

### Windows, documents, and quitting

- One window owns a given `.captions_json5` at a time. `electron/main.ts` keeps a
  `documentOwners` registry (realpath + case-folded key); `doc:claim` returns
  `{claimed: false}` and focuses the owning window instead. Sharing the same **media**
  across windows is fine — `media://` is read-only.
- All document-open entry points (Open menu, drag & drop, OS `open-file`) funnel through
  `openDocumentFromPaths()` in App.vue, so they share one unsaved-changes check **and one
  document claim**. Components that pick files (`FileDropZone.triggerFileInput()`) return
  paths; they must never call `store.processFilePaths()` themselves, or they reintroduce
  a path that skips both.
- **Order matters inside `openDocumentFromPaths()`: prompt, then claim.** `doc:claim`
  gives a window at most one transcript, so claiming a new file releases the claim on the
  currently open one. Claiming before the prompt meant a cancel left the open document
  unowned, and `claimedFilePath` being sticky meant it was never re-claimed.
- Quitting asks each window **in turn**; any window's "Keep working" (`app:cancel-quit`)
  aborts the whole quit. Window close interception is disabled under `NODE_ENV=test`
  unless a spec sets `CAPTION_EDITOR_INTERCEPT_CLOSE=1` (see
  `tests/electron/quit-coordination.electron.spec.ts`, which must tear down with
  `app.exit()` rather than `app.quit()`).

### Captions JSON Format
- Primary document format: `*.captions_json5`
- Media file paths stored as **absolute** internally, **relative** when serialized
- Speaker embeddings stored in `embeddings[]` (no VTT comments)

### Key Features

**Native Electron Menu**
- Menu in `electron/main.ts`, actions via IPC
- Includes "AI Annotations → Caption with Speech Recognizer"

**ASR Integration**
- Dev mode: Uses `uv run python transcribe_cli.py`
- Production: The signed/notarized .app bundles the
  //transcribe_rs/transcribe-rs and //transcribe_rs/embed-rs Rust
  binaries inside `Contents/Resources/bin/`. `npm run build:rust`
  stages them under `dist-rust/` (including `ffmpeg` via
  `npm run build:ffmpeg` / `scripts/stage-ffmpeg.py`); electron-builder's
  `extraResources` copies them into the .app, and the existing
  codesign+notarize+staple flow signs them along with the rest of the
  Mach-O files in the bundle. `transcribe-rs` / `embed-rs` use **only**
  the staged `bin/ffmpeg` (sibling of the Rust binaries) or
  `CAPTION_EDITOR_FFMPEG` — never the user's PATH. `npm run verify:dist-rust`
  fails packaging/e2e if `dist-rust/ffmpeg` is missing.
- **Rust bypass (experimental):** Set both env vars to invoke the
  //transcribe_rs/ binaries instead of Python uvx. Args are wire-compatible
  (--chunk-size, --model, --remux-mp3 forwarded as-is) so this is a drop-in
  swap; setting only one of the two also works (e.g. test transcribe-rs
  while still embedding via Python).
  ```bash
  bazelisk build //transcribe_rs/transcribe-rs //transcribe_rs/embed-rs
  export CAPTION_EDITOR_TRANSCRIBE_RS_BIN=$(pwd)/bazel-bin/transcribe_rs/transcribe-rs/transcribe-rs
  export CAPTION_EDITOR_EMBED_RS_BIN=$(pwd)/bazel-bin/transcribe_rs/embed-rs/embed-rs
  # Optional: point parakeet at our own ONNX export (in lieu of HF id):
  #   set the model to the local path in the app UI, or default to
  #   istupakov/parakeet-tdt-0.6b-v3-onnx (auto-fetched via hf-hub).
  npm run dev:electron:watch
  ```
- Default model: `nvidia/parakeet-tdt-0.6b-v3`
- Test override: Set `window.__ASR_MODEL_OVERRIDE = 'openai/whisper-tiny'`

**Playback speed**
- `<select>` at the right end of the transport row in `MediaPlayer.vue`; options in
  `PLAYBACK_RATE_OPTIONS` (`src/types/schema.ts`).
- Stored per document in `uiState.playbackRate`, so it is *view* state: it round-trips with the
  file but never raises the unsaved-changes prompt.
- `HTMLMediaElement.playbackRate` resets to 1 whenever a source loads, and switching between the
  `<video>` and `<audio>` branch mounts a fresh element — hence `applyPlaybackRate()` on
  `loadedmetadata`, not only on change. A rate loaded from a file is snapped onto the option list
  (`nearestPlaybackRate`) so a hand-edited value can't leave the `<select>` with no match.
- The element is a **second** way to change speed: Chromium's `controls` overlay has its own
  speed submenu (behind ⋮) that writes `playbackRate` directly. `onMediaRateChange` mirrors that
  back into the store, which is why `PLAYBACK_RATE_OPTIONS` is exactly Chromium's own list
  (0.25 … 2) — a rate the overlay can produce but we cannot represent would be snapped away
  under the user's fingers.

**Current Caption panel (under the media player)**
- **Click a word** with a timestamp to move the playhead there — the same gesture as clicking a
  table row / start-time cell. Words without timestamps (typed during an edit) are inert and get
  a text cursor instead of a pointer. The handler ignores `event.detail > 1` so the second click
  of a double-click doesn't also seek.
  Seeking goes through `seekTo()`, which sets the media element *and* `store.currentTime` —
  the element is needed because the `store.currentTime` watcher only re-syncs on jumps >0.5s.
  A click that lands before `loadedmetadata` is not lost: the element ignores the seek, but
  `MediaPlayer.onMediaLoaded()` then restores the playhead from `store.currentTime`, which now
  holds the clicked word's time.
- **Double-click** the box to edit: the word-span display is swapped for a `<textarea>`.
  **Enter** commits, **Shift+Enter** adds a newline, **Esc** cancels, blur commits.
- Two invariants worth preserving (`MediaPlayer.vue`):
  1. *Display and edit are separate elements.* `currentWordIndex` recomputes on every
     `timeupdate`, so the word spans re-render several times a second — a `contenteditable`
     display would lose the caret mid-keystroke.
  2. *The edit target is pinned by segment id*, not by `store.currentSegment` (which follows the
     playhead). That is what lets playback continue while you type.
- Commits go through `store.updateSegment(id, { text, verified: true })` — the same call the
  table's text column makes — so `realignWords()` preserves word timestamps and the grid updates
  reactively. Entering edit mode also calls `store.selectSegment(id)` so the table agrees on the
  target row.

**Preferences**
- App-wide user settings, persisted per *user*, not per document.
- **Where does a new setting go?** Ask whether it is a property of the document or of the
  person. *"Which columns is this transcript sorted by, where was I in the audio"* → `uiState`
  (and it **must** be added to all three schemas — see "Dirty tracking and view state").
  *"How do I like the editor to behave"* → here; no schema changes, nothing written into the
  user's `.captions_json5`. Note the rule follows the *subject*, not the phrasing: playback
  speed sounds like a personal habit but is a property of the recording (a fast talker wants
  0.75x, a clear dictation 1.5x), so `playbackRate` lives in `uiState`. `pausePlaybackWhileEditingCaption` is the second kind: it does not
  describe the transcript, so putting it in `uiState` would both bloat every saved file and
  make the behaviour change depending on which document is open.
- Schema + defaults + `sanitizePreferences()` live in `src/types/preferences.ts`, imported by
  **both** the Electron main process and the renderer. Unknown/wrong-typed keys are dropped on
  read, so an old or hand-edited file can't break the app.
- Persisted in `userData/preferences.json` via `preferences:getSync` / `preferences:set` IPC
  (`localStorage` is unreliable for packaged `file://` loads — same reason as license
  acceptance). Outside Electron the store falls back to `localStorage`.
- A `preferences-changed` broadcast keeps other open windows in sync
  (`adoptExternalPreferences()` — adopts without re-persisting).
- UI: `PreferencesDialog.vue`, opened from **Settings…** in the app menu (macOS) or
  **File → Preferences…** elsewhere, both bound to `Cmd/Ctrl+,`. Tests can open it via
  `window.openPreferencesDialog()`; the store is at `window.$preferencesStore`.
- To add a setting: add the field + default in `src/types/preferences.ts`, then a row in
  `PreferencesDialog.vue`. No IPC or persistence changes needed.

**Sequential Playback**
- Plays segments in table order, skipping gaps
- Playlist captured at start via `forEachNodeAfterFilterAndSort()`

**Word Timestamp Preservation**
- `realignWords()` uses LCS algorithm to preserve timestamps after edits
- New/modified words get no timestamps, unchanged words keep original

### Key Utilities
- `findIndexOfRowForTime(segments, time)`: Find segment index for time
- `serializeCaptionsJSON5(document)`: Convert to stable `.captions_json5` (converts paths to relative via store export)
- `parseCaptionsJSON5(content)`: Parse `.captions_json5` to document
- `realignWords(originalWords, editedText)`: Preserve word timestamps

## Common Issues

### AG Grid Row Selection
Call `deselectAll()` before `setSelected(true)`:
```typescript
gridApi.value.deselectAll()
rowNode.setSelected(true)
```

### Selection vs. context target (Lightroom-style)

**Rule:** Use `resolveRowActionTargetRows(gridApi, anchorNode)` in `src/utils/rowActionTarget.ts`. If several rows are selected and the **anchor** row (clicked / right-clicked cell’s `params.node` or `event.node`) is **in** that selection → actions apply to **all selected rows**; otherwise → **only the anchor row**. The table context menu shows a non-interactive header like **“Targeting N row(s)”** (similar to Finder’s “N items” / macOS menu section headers).

- **Context menu** (`CaptionTable.vue` `onCellContextMenu`): target rows from `resolveRowActionTargetRows`; speaker similarity from the menu passes that set into `computeSpeakerSimilarity(rows)`. The app menu / shortcut still calls `computeSpeakerSimilarity()` with no args → uses current `getSelectedRows()`.
- **✓ / ★ / speaker column:** `VerifiedCheckCell`, `StarRatingCell`, and speaker `onCellValueChanged` use the same helper.

**AG Grid:** `CellContextMenuEvent.node`, `ICellRendererParams.node` / `.api`; `getSelectedNodes()`, `deselectAll()`, `setSelected()`.

**Regression tests:** `tests/selection-targeting.spec.ts`.

### Test Button Clicks
Use `page.evaluate()` to click directly when elements are obscured:
```typescript
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button'))
    .find(b => b.textContent?.includes('Button Text'))
  if (btn) btn.click()
})
```

### AG Grid Known Bugs
1. **Ghost rows**: Filter by content in tests (`text.length > 0`)
2. **Row ordering**: Rows stay in insertion order, not array order (sort by time in tests)
3. **Scroll / viewport jumps (intermittent)**: `CaptionTable` sets **`suppressScrollOnNewData`** so replacing `rowData` (Vue gives a new array each store update) does not reset vertical scroll the way a full “new dataset” load would; pair with opt-in logging — `localStorage.setItem('captionDebugGrid','1')` then reload, or `window.__captionGridDebug = true` and `window.__captionGridDebugAttach()`. See `src/utils/captionGridDebug.ts`.

## Python Tools

### Transcription (transcribe/transcribe_cli.py)
```bash
cd transcribe
uv run python transcribe_cli.py audio.wav \
  --max-intra-segment-gap-seconds 2.0 \
  --max-segment-duration-seconds 10.0
```

Three-pass pipeline: split by gaps, split long segments, resolve overlaps.

### Speaker Embeddings (transcribe/embed_cli.py)
```bash
cd transcribe
uv run python embed_cli.py file.captions_json5  # Uses wespeaker (no token required)
```

Writes speaker embeddings into the `.captions_json5` document `embeddings[]`.

### macOS release build (notarization)
Use `./scripts/build-released-app.sh` for a distributable Mac build. It signs and notarizes so Gatekeeper allows the app when users download it. Config: `mac.notarize: true` in electron-builder.json. Requires in `.envrc.private`: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` (app-specific password from appleid.apple.com). Script exports `APPLE_TEAM_ID`. Without the Apple ID vars, notarization is skipped and the app may be quarantined on download.

**Staple Error 65 fix:** We patch `@electron/notarize` (see `patches/`) to use `zip -r -y` instead of `ditto` when creating the notarization archive, so the submitted zip matches the on-disk app and stapling succeeds. `postinstall` runs `patch-package` to reapply the patch after npm install.
