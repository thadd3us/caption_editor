# Claude Development Notes

## Important Reminders

**DO NOT create summary/readme files like CLUSTERING_README.md, IMPLEMENTATION_SUMMARY.md, etc.**
- Just update this CLAUDE.md file with notes
- Users can read the code and tests to understand features

## Development Workflow

### Version Management

**IMPORTANT: When changing Node.js/TypeScript code, bump the Electron app version!**

Both constants live in `electron/constants.ts`:

1. **`APP_VERSION`** — Bump this (e.g., `1.4.0`). Single source of truth for the app version.
2. **`ASR_COMMIT_HASH`** — After bumping the version, commit and **push**, then update this hash to point to that pushed commit. This is the commit that `uvx` fetches from GitHub for production ASR. It must be a pushed commit that includes the `transcribe` packaging config.

The two-step workflow:
```bash
# 1. Bump APP_VERSION, commit, and push
git add -A && git commit -m "Bump version to X.Y.Z"
git push
# 2. Update ASR_COMMIT_HASH to the commit hash from step 1, commit, and push
git rev-parse HEAD  # copy this hash
# edit ASR_COMMIT_HASH in electron/constants.ts
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

### Quick Start

```bash
# Run all tests
./scripts/run-all-tests.sh

# Run specific suites
npm test                    # Unit tests (watch mode)
npm run test:unit           # Unit tests (once)
npm run test:e2e            # E2E tests (auto-builds)
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
- Production: Uses bundled `uvx` to fetch from GitHub at specific commit
- Default model: `nvidia/parakeet-tdt-0.6b-v3`
- Test override: Set `window.__ASR_MODEL_OVERRIDE = 'openai/whisper-tiny'`

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

### UVX Distribution
Package for distribution: `./scripts/package-for-uvx.sh`
- Creates wheel, source dist, and `overrides.txt` in `dist-uvx/`
- `overrides.txt` needed to bypass nemo-toolkit's overly conservative numpy constraint

### macOS release build (notarization)
Use `./scripts/build-released-app.sh` for a distributable Mac build. It signs and notarizes so Gatekeeper allows the app when users download it. Config: `mac.notarize: true` in electron-builder.json. Requires in `.envrc.private`: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` (app-specific password from appleid.apple.com). Script exports `APPLE_TEAM_ID`. Without the Apple ID vars, notarization is skipped and the app may be quarantined on download.

**Staple Error 65 fix:** We patch `@electron/notarize` (see `patches/`) to use `zip -r -y` instead of `ditto` when creating the notarization archive, so the submitted zip matches the on-disk app and stapling succeeds. `postinstall` runs `patch-package` to reapply the patch after npm install.
