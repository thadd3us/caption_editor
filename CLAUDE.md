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

   The Rust binaries are **bundled** into the packaged app by electron-builder's `extraResources` (`Contents/Resources/bin` on macOS, `resources/bin` in the `.deb`). Nothing downloads them at runtime — there is no fetch logic in `electron/` or `scripts/` — so the version matters for `--version` output and release asset names, not for resolving a download. *This line previously claimed the app downloaded them by version tag; it does not.*

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

### Dependency upgrades

Four ecosystems, each with its own lockfile, and **all four honour the same
7-day cooldown**: nothing is pinned to a version published less than a week ago.
The point is to let someone else find the day-one regression.

| ecosystem | source of truth | refresh |
| --- | --- | --- |
| Bazel modules | `MODULE.bazel` + `MODULE.bazel.lock` | edit `bazel_dep`, then `bazelisk mod tidy` |
| Rust | `transcribe_rs/Cargo.lock` | `cargo update`, then `bazelisk mod tidy` |
| Python | `transcribe/uv.lock` | bump `exclude-newer`, `uv lock --upgrade`, re-export (below) |
| JS | `package-lock.json` **and** `pnpm-lock.yaml` | `npm install`, then `pnpm import` |

Specifics that are easy to get wrong, each of which has already cost someone an
afternoon:

**The Python cooldown is a literal date, not a rolling window.**
`[tool.uv] exclude-newer` in `transcribe/pyproject.toml` is a fixed timestamp, so
it does not expire — it just silently goes stale, and the whole ML closure stops
moving. (It sat at 2026-05-21 for five and a half months before anyone noticed.)
Bump it to roughly a week ago, then `uv lock --upgrade`, then regenerate the
Bazel requirements with the exact command in the header of
`requirements_bazel.txt`:

```bash
cd transcribe
uv lock --upgrade
uv export --format requirements-txt --no-emit-project --no-dev -o requirements_bazel.txt
```

Letting that date jump lifts `nemo-toolkit` to 3.x and `transformers` to 5.x,
which is the ASR engine changing underneath you. Both now carry explicit `<3` /
`<5` ceilings in `pyproject.toml` so that is a deliberate change rather than a
side effect of a date edit.

**`ort` must be pinned with `=`, and `parakeet-rs` moves with it.** `ort` is a
prerelease (`2.0.0-rc.N`), and Cargo's caret rules let `2.0.0-rc.12` resolve all
the way up to the newest rc. `parakeet-rs` 0.3.x asks for `^2.0.0-rc.13` but does
not actually compile against rc.15, so a bare `cargo update` yields a tree that
fails to build *inside parakeet's own source*. Hence `ort = { version =
"=2.0.0-rc.12", ... }`. Upstream fixed the under-constraint in 0.4.1+
(`=2.0.0-rc.15`), so moving to rc.15 means moving `parakeet-rs` to 0.4.x and
fixing the `SessionBuilder::new()` call sites in the same change.

**`@vue/*` needs exactly one version in the tree.** `public_hoist_packages` in
`MODULE.bazel` can hoist each package at one version only, and aspect_rules_js
fails *analysis* (not a test) if two are present. Nothing there pins a version,
so the `overrides` block in `package.json` aliases `@vue/compiler-core`,
`@vue/compiler-dom` and `@vue/shared` to `$vue`. Drop it and any transitive dep
wanting a newer vue patch than the pinned one — `@vue/test-utils` reliably does —
breaks the build.

**`pnpm import` will quietly undo the cooldown.** pnpm 11 enforces a release-age
gate of its own, and rather than failing it appends the offending versions to
`minimumReleaseAgeExclude` in `pnpm-workspace.yaml`. If that key grows after an
import, the right fix is almost always to pin the npm dep to an older version,
not to keep the exclusion.

**Node 26 breaks `localStorage` in specs, and `src/test-setup.ts` is the fix.**
Node 26 installs Web Storage as a *global*, and under happy-dom `globalThis`
**is** `window` — so Node's `localStorage` / `sessionStorage` accessors land on
the object happy-dom wanted, and Node's win. `localStorage` becomes `undefined`
(no `--localstorage-file`), which at least fails loudly; `sessionStorage` becomes
a real *process-wide* store, which does not fail at all and silently leaks state
between tests. `src/test-setup.ts` overwrites both with fresh happy-dom `Storage`
instances. Two constraints on that code, each learned the hard way: define them
as **value** properties, since an accessor forwarding to `window[key]` recurses
forever when the two objects are the same; and leave them **writable**, because
eight specs do `global.localStorage = mock`. `node
--no-experimental-webstorage` also works but only for whoever remembers the flag.

**Install scripts are allowlisted twice, once per package manager.** npm 11.20
(which ships with Node 26) gates lifecycle scripts the way pnpm already did: a
package with a postinstall hook is skipped, with only an `npm warn
install-scripts` line to say so. `allowScripts` in `package.json` is npm's list
(`npm install-scripts ls` shows what is pending, `approve <pkg>` adds it);
`allowBuilds` in `pnpm-workspace.yaml` is pnpm's. A dep that gains a hook needs
adding to **both**, and the npm failure mode is silent — a skipped script shows
up later as a missing native binary, not as an install error.

**`.npmrc` carries one pnpm-only key on purpose.** `public-hoist-pattern[]=*` is
not an npm setting, so npm logs `Unknown project config` on every command and
warns it will break in its next major. Do not just delete it: `.npmrc` is passed
to `npm_translate_lock` as `npmrc = "//:.npmrc"`, and per the comment there that
pattern is what makes `@vue/test-utils` resolve in the Bazel-linked tree. Moving
it to `publicHoistPattern` in `pnpm-workspace.yaml` is the real fix and wants its
own change, with the vitest targets actually run.

**Prettier is installed and wired to nothing.** It is in `devDependencies` and
named in an `eslint.config.js` comment, but no gate runs it; ~75 files under
`src/` and `electron/` do not match its output and never have. Do not
"fix" that as a side effect of some other change — it is a 75-file diff.

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

### What the quality gates actually cover

Worth knowing precisely, because each of these had a hole in it that was invisible until
someone looked:

| gate | target | covers |
| --- | --- | --- |
| `vue-tsc` | `//:ts_typecheck` | `src/**` + `electron/constants.ts` (`tsconfig.json`) |
| `tsc` | `//:ts_typecheck_node_side` | `electron/**` + `tests/**` (`tsconfig.node-side.json`) |
| ESLint | `//:ts_eslint` | `.ts` **and** `.vue` |
| Vitest | `//:ts_vitest_unit` | `src/**/*.test.ts` |
| Playwright | `//:e2e_playwright` | `tests/**`, minus `@expensive` |
| ruff + pyright | `python-lint` CI job | `transcribe/**` |
| lockfile drift | `//tools/bazel:lockfile_sync_test` | package.json vs pnpm-lock.yaml |

Two of these are not Bazel targets and that is deliberate. **ruff and pyright** run in a
CI job because `uv` is not on the fixed PATH `.bazelrc` pins for every action, and
pyright is a Node program that downloads its own runtime on first use — neither survives
a hermetic sandbox. They also run in `scripts/pre-commit`, but that hook is installed by
hand per clone (`scripts/setup-hooks.sh`), so the CI job is what makes them binding.

**Why `tsconfig.node-side.json` is separate from `tsconfig.json`:** the renderer is
checked by `vue-tsc` with DOM libs; the Electron main process and the Playwright specs
need Node types and no `.vue` handling. Before it existed, `tsconfig.json` included
`src/**` plus `electron/constants.ts` and nothing else, so `electron/main.ts` — the file
that spawns processes and serves files over a custom protocol — was type-checked by
nothing at all. `vite build --config vite.electron.config.ts` does not close that: esbuild
transpiles without checking.

One sharp edge in that config: it has to include the DOM lib, because the Playwright
specs' `page.evaluate()` callbacks legitimately use DOM globals. So a bare `window` in
*Node* scope still type-checks (TypeScript sees the DOM `Window`, which is always
defined) even though Node has no such global and it throws at runtime. If you are
renaming things in the specs, grep rather than trusting tsc.

**Typed `window` globals.** `src/types/window-globals.d.ts` declares `$store`,
`__agGridApi` and the `App.vue` test hooks, so specs reach them as `window.$store.…`
rather than `(window as any).$store.…` — which is where nearly 700 of the repo's
`no-explicit-any` warnings came from. The point is not the warning count: the store's
actions are now type-checked at every call site in the suite.

It types `$store` with `ReturnType<typeof import('../stores/captionStore').useCaptionStore>`
— an inline `import(...)`, deliberately, not a top-level `import type`. A top-level
import makes the store's own type depend on the `Window` interface it augments (any
`window.…` reference inside `captionStore.ts` closes the loop), and TypeScript resolves
that cycle by inferring `Store<"captions", {}, {}, {}>`. That fails silently: nothing
errors, every `window.$store.x` just becomes an unchecked member access again. It also
depends on which files are in the program, so it reproduced under
`tsconfig.node-side.json` and not under `tsconfig.json`. If the store's members ever stop
resolving in the specs, suspect this first.

**ESLint and `.vue`:** `eslint.config.js` needs both `eslint-plugin-vue` and
`vue-eslint-parser`; without them flat config never matches a `.vue` file and silently
lints nothing. It uses `flat/essential` rather than `flat/recommended` — the difference
between the tiers is almost all formatting, and prettier already owns that. A handful of
correctness rules from the higher tiers are enabled individually.

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

### Selection pinning (clicked row vs. playhead)

`store.setCurrentTime()` auto-selects the segment under the playhead, and `CaptionTable`'s
auto-scroll watcher follows it. That is right during playback and wrong immediately after a
click: chunked ASR leaves neighbouring segments touching or overlapping by milliseconds, and a
seek to a row's `startTime` lands a frame *early* — inside the previous segment. The selection
(and, under a speaker-similarity sort, the viewport) jumped to an unrelated row, so the next
field you edited belonged to the wrong segment.

Fix: `pinnedSegmentId` + `pinnedAtTime` in `captionStore.ts`. `selectSegment()` — the only way
the selection is set *deliberately* — pins; `setCurrentTime()` sets `selectedSegmentId`
directly and therefore never pins. While the pin holds, `currentSegment` **is** the pinned
segment, so the Current Caption panel agrees with the table. `pinHoldsAt(time)` holds while the
playhead is inside the pinned segment (with `PIN_HOLD_LEAD_SECONDS` of slack before its start,
for seeks that undershoot) **or** while it has not moved more than `PIN_RELEASE_DRIFT_SECONDS`
from where it was when pinned — the second clause is what lets a row selected *without* a seek
(context menu, "Add caption", reopening a file) survive the `timeupdate` events that follow.
Playing or dragging past either bound releases it, which is exactly when following the playhead
is what the user means.

Consequence for click handlers: **seek first, then `selectSegment()`**, so the pin is anchored
at the new playhead position. `CaptionTable.onRowClicked`, the Start/End `onCellClicked`
handlers and `MediaPlayer.onCaptionWordClick` all do this — note the End cell seeks to a
timestamp that belongs to the *next* segment, so without the explicit pin it would select one
row down from the cell you clicked.

Regression tests: `src/stores/captionStore.selectionPin.test.ts` (the rule) and
`tests/electron/selection-pin.electron.spec.ts` (a real click, sorted by speaker so the
hijacking row is off-screen).

### Undo / redo

`Cmd+Z` / `Shift+Cmd+Z`, over the whole document: deletes, merges, splits, bulk speaker
and rating changes, ASR merges — not just text fields.

**Why it is cheap.** The document model is immutable, so a history entry is one object
reference rather than a copy, and the parts that did not change are shared between
versions. Editing `title` leaves the `segments` array literally the same object; editing
one segment leaves `embeddings` — a base64 float32 vector per segment — untouched and
shared. Deep-copying per keystroke would not have been viable; structural sharing makes
a 100-entry stack unremarkable. `UNDO_LIMIT` bounds it anyway, because each entry does
pin whichever arrays it references.

**What counts as an edit** is the same boundary `isDirty` already draws, and for the same
reason: both hang off the single `flush: 'sync'` watcher on `document`. A
`withoutDirtying()` replacement (`updateFilePath`) is not an edit and never enters the
history — otherwise `Cmd+Z` after a Save As would silently revert the path.

**`isDirty` is identity, not a counter.** `markSaved()` records the document object that
matches disk, and the watcher sets `isDirty = document.value !== savedDocument`. So
undoing back to the saved state clears the flag instead of leaving the file looking
edited, which matters because undo is how a user says "I did not mean that" — they should
not then be pushed into saving it. Immutability is what makes `===` the exact test.

**Loading clears the history.** `loadFromFile`, `loadFromSrt` and `reset()` call
`clearHistory()`, and must do so *after* replacing `document.value`, not before — the
watcher records the outgoing document, so clearing first leaves that one entry behind.

**The Edit menu does not use `role: 'undo'`.** That role is `webContents.undo()`, which is
text-field undo only: it does nothing for a deleted row. The menu items send `menu-undo` /
`menu-redo` instead, which means they own the accelerator and the renderer owes text
fields their behaviour back — `handleMenuUndo` in App.vue checks whether an `INPUT`,
`TEXTAREA` or contenteditable has focus and calls `document.execCommand('undo')` if so.
`execCommand` is deprecated but is still the only way to drive a text control's own undo
stack from script.

Enabled state is pushed to the main process via `updateUndoMenuEnabled`, re-sent on window
`focus` because `Menu.setApplicationMenu` installs one menu for the whole app — the same
caveat as the AI Annotations items.

Tests: `src/stores/captionStore.undo.test.ts` for the rules,
`tests/electron/undo-redo.electron.spec.ts` for the wiring, including clicking the real
menu item (main → IPC → renderer) and confirming a focused cell editor keeps its own undo.

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

**`src/types/schema.ts` is the only place `uiState` is modelled.** Add a field there and
you are done — no Python change, no Rust change. `transcribe/schema.py` carries it as
`dict[str, Any]` and `transcribe_rs/caption-schema` as `serde_json::Value`, so both pass
the whole thing through untouched.

*This used to be a three-schema hand-maintained rule, and it was actively losing data.*
Pydantic and serde drop keys they do not enumerate, and `embed-rs` / `embed_cli` rewrite
the whole document — so "Compute Speaker Embeddings" was silently stripping `sort`,
`sortIndex`, `flex`, `aggFunc`, `pivot`, `pivotIndex`, `rowGroup` and `rowGroupIndex`
from every `columnState` entry, i.e. the user's sort order and column widths. The guard
tests missed it because they enumerated fields too, and so could only ever check the
fields someone had remembered to list. They now assert the mapping round-trips *whole*,
unknown keys included (`transcribe/ui_state_round_trip_test.py`,
`ui_state_survives_round_trip_including_unknown_keys` in the Rust crate).

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

### Renderer sandbox and what `media://` will serve

The renderer runs with `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`.
It is the process that parses untrusted `.captions_json5` from disk, so the things it can
reach are worth keeping small.

**Getting the sandbox on took two changes, and both are easy to undo by accident.**

1. *The preload must not import Node builtins.* A sandboxed preload's `require` resolves
   only `electron`, `events`, `timers` and `url`. It used to `import * as path from 'path'`,
   which threw before `contextBridge.exposeInMainWorld` ran — so `window.electronAPI` came
   back **entirely undefined**, not merely missing its path helpers. The renderer still
   needs those functions synchronously (`captionStore.exportToString()` returns a string),
   so they are evaluated in the main process behind `ipcRenderer.sendSync('path:call', …)`.
   That keeps Node's real `path`, and with it Windows drive letters and separators; a
   posix-only shim bundled into the preload would have quietly broken `isAbsolute('C:\…')`.
   The handler checks the operation against an allowlist rather than indexing off `path`.

2. *The preload must build to a single self-contained file.* It has its own Vite config
   (`vite.preload.config.ts`). Built as a second entry alongside the main process, Rollup
   hoisted the shared `electron/constants.ts` into a chunk and the preload opened with
   `require("./constants-<hash>.cjs")` — a local file, which the sandboxed `require`
   refuses. The symptom is identical to (1): no `electronAPI`, and no error in any obvious
   place, because the failure is in the preload rather than the page.

   If you ever see `window.electronAPI` undefined, check `dist-electron/preload.cjs` for a
   `require` of anything other than `electron`.

**`media://` serves only files the user opened.** The handler used to stat and stream
whatever path was in the URL, so `media://local/etc/passwd` was a valid request from the
renderer. Every legitimate URL is minted by `file:toURL` or `processDroppedFiles`, both of
which now record the realpath in `servableMediaPaths`; anything else gets a 403. Entries
are never removed — the renderer re-requests the file constantly while scrubbing. Tests
that want media must go through `electronAPI.fileToURL` rather than building a `media://`
URL by hand.

**The CSP differs between dev and production.** `'unsafe-eval'` and the `ws:`/`http:` in
`connect-src` exist for the Vite dev server and are omitted from a packaged build, which
loads from `file://` and needs neither. `'unsafe-inline'` for scripts stays in both: Vue
and AG Grid inject inline content, and removing it needs a nonce-based CSP.

**Window-open and off-origin navigation are denied**, with `http(s)` URLs handed to
`shell.openExternal` so a link in a caption opens in the user's real browser rather than
inside the app.

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
  (add it to `src/types/schema.ts` and you are done — see "Dirty tracking and view state").
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

### Cross-component state goes through the store

`CaptionTable` and `App.vue` used to pass three things between themselves outside Pinia:
the rows an action targets (a `window.__captionTableSelectedRows` global), a request to
open the delete dialog (a DOM `CustomEvent`), and a request to sort by speaker similarity
(another `CustomEvent`, the other way). None of it was visible to the type checker or to
anyone reading either component alone.

All three are store state now:

- **`selectedSegmentIds`** mirrors the grid's full selection. AG Grid still owns selection
  — it is the widget's own state — but nothing outside the table has to reach into the
  grid API to ask what is selected. Distinct from `selectedSegmentId`, which is the
  *anchor*: the row the playhead follows, that `uiState` persists, and that the selection
  pin keys off.
- **`pendingDeletion`** carries the target ids with the request. The old global was read
  back at confirm time, so a selection change between opening the dialog and clicking
  Delete could retarget it; now the rows deleted are the rows the menu named. There is a
  test for exactly that.
- **`speakerSimilarityRequest`** is a counter, not a boolean, because it is an event:
  asking twice has to fire twice and there is nothing to reset.

Still outstanding in the same vein: `CaptionTable` reaches the player with a raw
`document.querySelector('audio, video')` in three places to force a seek, because the
`store.currentTime` watcher in `MediaPlayer` only re-syncs the element on jumps over
0.5s. A `seekTo` action that distinguishes "the playhead moved" from "seek the element"
would remove it, but it touches the selection-pin ordering, so it wants its own change.

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

### Linux packaging

`npm run package:linux` builds a **`.deb`**, and that is the only Linux target.
AppImage was listed in `electron-builder.json` for a long time but never built by any
workflow; it is now removed deliberately, and the reason is worth keeping.

**AppImage silently disables the renderer sandbox on modern Ubuntu.** The AppRun
script electron-builder generates probes `unshare -Ur true` and, when that fails,
appends `--no-sandbox` to the app's own argv. Its comment calls this "an intentional
fail-safe: we prefer the app to start without sandboxing rather than crash on
startup." On Ubuntu 24.04+, `kernel.apparmor_restrict_unprivileged_userns=1` is the
default, so the probe *does* fail and the app runs unsandboxed — with no error, no
warning, and nothing in the UI to say so. Given that the renderer is the process that
parses untrusted `.captions_json5` (see "Renderer sandbox and what `media://` will
serve"), shipping that would quietly undo the hardening rather than report it.

**`deb` keeps the sandbox**, because electron-builder's deb target ships an AppArmor
profile (`abi <abi/4.0>` plus `userns,`) and its `postinst` installs it into
`/etc/apparmor.d/` and loads it with `apparmor_parser --replace`, behind a
`--skip-kernel-load` dry run so Ubuntu 22.04 — whose AppArmor predates `abi/4.0` —
skips it instead of failing. The same `postinst` sets `chrome-sandbox` to 4755 only
when user namespaces are unavailable.

All of that lives in electron-builder's own templates, so it can regress on an
upgrade without anyone touching this repo. `scripts/verify-deb.sh`
(`npm run verify:deb`) asserts it: the profile is present and grants `userns`, the
postinst does the three things above, the staged binaries and wespeaker model are in
the payload, and the control file has `Maintainer` and `Homepage`.

**It is built and checked on every PR**, by the `package-linux` job in `test.yml`,
not only on a release tag. That job also installs the `.deb` on an `ubuntu-24.04`
runner and launches the app without `--no-sandbox`, failing if Chromium reports a
sandbox failure. The runner is pinned to `ubuntu-24.04` rather than `ubuntu-latest`
precisely because 24.04 is where the userns restriction became the default.

*The reason this needs a PR-time job rather than a release-time one:* the Linux
targets had sat in `electron-builder.json` unbuilt, and the first time they were
actually run they failed immediately on two hard requirements of the fpm target —
`linux.maintainer` and a project homepage (now `homepage` in `package.json`).
Packaging that is only exercised at release time is packaging that breaks at release
time.

**Two platform-specific things had to give way.**

`coreml` is an Apple framework, and both `transcribe-rs` (via `parakeet-rs`) and
`embed-rs` (via `ort`) enabled it unconditionally. They now declare it under
`[target.'cfg(target_os = "macos")'.dependencies]`; Cargo unions features across that
and `[dependencies]`, so macOS gets exactly what it had before and Linux gets the CPU
path. Verify with `cargo tree --target x86_64-unknown-linux-gnu -p embed-rs-cli -f
"{p} [{f}]"` — `cargo metadata` will *not* tell you, because its feature resolution
is not target-aware and reports the union for every platform. Under Bazel,
crate_universe turns this into a `select()` on
`@rules_rust//rust/platform:aarch64-apple-darwin`, which is visible in
`MODULE.bazel.lock`. Changing these manifests requires refreshing that lock.

`.bazelrc` pinned a macOS `PATH` and a `~/Library/Caches` disk cache for every
action. Those now sit under `build:macos` / `build:linux` stanzas, auto-applied via
`common --enable_platform_specific_config`. The macOS strings are byte-identical to
what they were, deliberately: a forwarded env var contributes to the action cache key,
so rewording them would invalidate every cached action on every machine.

**ffmpeg staging works on both platforms now, and the check is not symmetrical.**
`scripts/stage-ffmpeg.py` still refuses to bundle an ffmpeg that references libraries
a target machine may not have, but "may not have" means something different on Linux.
On macOS the dangerous binary is Homebrew's, which points at `/opt/homebrew/Cellar`,
so "is it under `/usr/lib`?" separates safe from unsafe perfectly. On Linux, Ubuntu's
own ffmpeg links `libavcodec` and friends out of `/usr/lib/<triple>/` — the same
directory as libc — so a path rule accepts it and we would ship an ffmpeg that dies
on any machine without the `ffmpeg` package installed. An earlier version of this
function did exactly that. Linux therefore uses a *name* allowlist of the glibc/gcc
runtime and nothing else; `imageio-ffmpeg`'s build passes, a distro one does not.

### Entitlements

`assets/packaging/entitlements.mac.plist` grants the signed app three things, and each one is
commented in the file with why it is there. Two are V8's. The third,
`cs.disable-library-validation`, is the interesting one.

**`cs.debugger` is gone, and should stay gone.** It grants `task_for_pid` — the right to
attach a debugger to other processes on the machine — which is a capability for debugging
tools, not for an app. It was never used. Verified by signing `embed-rs` (ONNX inference, the
heaviest native thing we ship) with the hardened runtime and without it: runs normally.

**`cs.disable-library-validation` is load-bearing, and the failure mode is total.** Signed
without it, dyld refuses to map Electron Framework — *"not valid for use in process: mapping
process and mapped file (non-platform) have different Team IDs"* — and the app dies before a
window appears. That test used an ad-hoc signature, which has no Team ID at all, so a real
Developer ID build (where every nested binary shares one team) may well not need it. Nothing
third-party is dynamically loaded: `ort` is statically linked (no `load-dynamic`,
`otool -L` shows only `/usr/lib` and `/System/Library`), electron-builder's `files` list
excludes `node_modules` so no `.node` ships, and the only dylibs in the bundle are Electron's
own. To settle it, build with the real cert, drop the key, and launch the .app — that needs
the signing identity, so it is not answerable from a dev machine without one.

**`package.json` used to carry a top-level `"mac"` block** naming a Developer ID and pointing
at `build/entitlements.mac.plist`, a file that does not exist. electron-builder reads
`build.mac`, not a top-level `mac`, so it was never consulted — but it read as authoritative
and would have broken signing the moment someone "fixed" the nesting. Removed; the real
configuration is `electron-builder.json` alone.

### macOS release build (notarization)
Use `./scripts/build-released-app.sh` for a distributable Mac build. It signs and notarizes so Gatekeeper allows the app when users download it. Requires in `.envrc.private`: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` (app-specific password from appleid.apple.com). Script exports `APPLE_TEAM_ID`. Without the Apple ID vars, notarization is skipped and the app may be quarantined on download.

**Notarization is `xcrun notarytool`, not electron-builder.** `electron-builder.json` sets `mac.notarize: false` deliberately. electron-builder's built-in path (via `@electron/notarize`) hits a cdhash mismatch — "Error 65" — during stapling, because the archive it submits does not match the app on disk. So `scripts/build-released-app.sh` lets electron-builder sign, then submits the DMG itself:

```
xcrun notarytool submit "$DMG_PATH" --apple-id … --team-id … --wait
xcrun stapler staple "$DMG_PATH"   # and the .app
xcrun stapler validate …           # both
```

`.github/workflows/release.yml` does the same thing for tag builds. There is no `patches/` directory and no `patch-package`: an earlier fix patched `@electron/notarize` to use `zip -r -y` instead of `ditto`, and that approach was replaced by the manual flow above. `postinstall` is a no-op echo.

The release job also imports the Developer ID into a temporary keychain by hand and passes `CSC_KEYCHAIN`, because electron-builder 26's own `createKeychain()` fails on macOS 26 (electron-builder #10101). See the comments in `release.yml` for the details.
