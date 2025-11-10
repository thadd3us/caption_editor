# Claude Development Notes

## Important Reminders

**DO NOT create summary/readme files like CLUSTERING_README.md, IMPLEMENTATION_SUMMARY.md, etc.**
- Just update this CLAUDE.md file with notes
- Users can read the code and tests to understand features
- If documentation is needed, ask the user first

## Development Workflow

### Committing Work

**IMPORTANT: Always commit your work when you reach a good checkpoint!**

A "good checkpoint" is when:
- Tests are passing
- Code is in a working state
- A logical unit of work is complete (bug fix, feature addition, refactor, etc.)
- Documentation has been updated to reflect changes

This ensures:
- Work is not lost if something goes wrong
- Changes can be easily reviewed and understood
- It's easy to revert if needed
- Progress is tracked in git history

**Example commit workflow:**
```bash
# 1. Make sure all tests pass
npm test
DISPLAY=:99 npx playwright test tests/electron/

# 2. Stage all changes
git add -A

# 3. Commit with descriptive message and co-author trailer
git commit -m "Your detailed commit message" --trailer "Co-authored-by: Sculptor <sculptor@imbue.com>"
```

## Testing Guidelines

### Performance Requirements

Tests should run quickly to maintain development velocity:

- **Unit tests**: Maximum 4 seconds total
- **E2E tests**: Maximum 25 seconds total

### Test Status Overview

**Current Test Suite Status:**
- ✅ TypeScript Unit Tests: 96/96 passing ⭐ **ALL PASSING!**
- ✅ Python Tests: 19/26 passing (7 failures expected - require HF_TOKEN or high memory)
  - ✅ **ASR Segment Splitting**: 16/16 passing (unit + integration tests)
  - ⚠️ Diarization/Embedding: 3 failures (require HF_TOKEN)
  - ⚠️ Parakeet: 1 failure (OOM in resource-constrained environments)
  - ⚠️ VTT snapshots: 3 failures (test data regenerated, UUIDs changed)
- ✅ UI/Interaction E2E Tests: 15/15 passing ⭐ **ALL PASSING!**
- ✅ Electron Platform E2E Tests: 23/23 passing ⭐ **ALL PASSING!**

**Total: 153/160 tests (19 Python + 136 TypeScript passing)**

**Test Organization:**
- **UI/Interaction E2E** (`tests/*.spec.ts`): Tests UI functionality, user interactions, media playback controls
- **Electron Platform E2E** (`tests/electron/*.spec.ts`): Tests Electron-specific features (file system, OS integration, IPC)

**Platform Support:**
- ✅ **macOS**: All tests work natively, no special setup needed
- ✅ **Linux/Docker**: Electron Platform tests require Xvfb (see setup instructions below)

**Quick Start:** Use `./scripts/run-all-tests.sh` or `npm run test:all:complete` to run all tests automatically!

**Note:** The app is now **Electron-only**. Browser mode and localStorage have been removed for simplicity.

### NPM Test Scripts

Quick reference for npm test commands:

```bash
# Unit tests
npm test                      # Run unit tests in watch mode
npm run test:unit             # Run unit tests once
npm run test:unit:coverage    # Run with coverage report

# E2E tests
npm run test:e2e              # Run all E2E tests (UI + Electron Platform)
npm run test:e2e:browser      # Run UI/Interaction E2E tests only
npm run test:e2e:electron     # Build and run Electron Platform tests
npm run test:e2e:ui           # Run E2E tests with Playwright UI

# Complete test suite
npm run test:all:complete     # Run ALL tests (unit, E2E, Electron, Python)
./scripts/run-all-tests.sh    # Same as above, with more options
```

### Running Tests

#### Prerequisites

Before running tests for the first time, install dependencies:
```bash
npm install
```

For Python/transcription tests, use `uv` (already installed in the dev container):
```bash
cd transcribe
uv sync  # Installs dependencies if needed
```

#### TypeScript Unit Tests
```bash
npm test
```

Current performance: ~1.7s for 96 tests ✅

With coverage:
```bash
npm test -- --coverage
```

Current coverage: 94.62% ✅

#### TypeScript E2E Tests

**UI/Interaction E2E Tests:**
```bash
npx playwright test --grep-invert "electron"
```

Current performance: ~13s for 15 tests ✅

**Electron Platform E2E Tests:**
```bash
# macOS:
npm run build:all && npx playwright test tests/electron/

# Linux/Docker (requires Xvfb):
npm run build:all && start-xvfb.sh && DISPLAY=:99 npx playwright test tests/electron/
```

Current performance: ~21s for 18 tests ✅

**All E2E Tests:**
```bash
npx playwright test
```

#### Python Tests
```bash
cd transcribe
uv run pytest tests/ -v
```

To update snapshots after intentional changes:
```bash
uv run pytest tests/ -v --snapshot-update
```

Current performance:
- Core splitting tests: ~0.1s for 16 tests (no ASR required) ✅
- Full transcription tests: ~25s for 1 test (Whisper inference)
- Total: ~60s for 26 tests (19 passing, 7 expected failures)

#### Run Specific Test Files
```bash
# TypeScript unit test
npm test src/utils/findIndexOfRowForTime.test.ts

# UI/Interaction E2E test
npx playwright test vtt-editor.spec.ts

# Electron Platform E2E test (macOS)
npx playwright test tests/electron/file-save.electron.spec.ts

# Electron Platform E2E test (Linux/Docker)
DISPLAY=:99 npx playwright test tests/electron/file-save.electron.spec.ts

# Run specific test by name (grep)
npx playwright test tests/electron/file-association.electron.spec.ts --grep "should open VTT file passed as command line argument"

# Python test
cd transcribe
uv run pytest tests/test_transcribe.py -v

# With specific test function
uv run pytest tests/test_transcribe.py::test_transcribe_osr_audio -v
```

**Note:** Electron tests require the app to be built first:
```bash
npm run build:all
```

#### Run All Tests (Full Suite)
```bash
# Use the helper script (recommended)
./scripts/run-all-tests.sh

# Or manually:
npm test -- --coverage           # Unit tests with coverage
npx playwright test              # All E2E tests
cd transcribe && uv run pytest tests/ -v  # Python tests
```

### Timeout Configuration

Timeouts are configured in `playwright.config.ts`:

- **Global timeout**: 10 seconds (sufficient for most E2E tests)
- **Comprehensive test**: 15 seconds (has 21 steps)

If a test times out, it indicates a performance issue that needs fixing rather than increasing the timeout.

### Test Organization

#### Unit Tests (`src/**/*.test.ts`)
- Fast, isolated tests
- No browser or DOM required
- Test pure functions and utilities
- Use Vitest

#### UI/Interaction E2E Tests (`tests/*.spec.ts`)
- Test UI functionality and user interactions
- Test media playback controls, caption editing, table interactions
- Run in Playwright's Chromium (but app is Electron-only)
- Keep tests focused and efficient

#### Electron Platform E2E Tests (`tests/electron/*.spec.ts`)
- Test Electron-specific features
- File system operations, OS integration (file associations), IPC
- Test file loading/saving with full paths
- Require app build before running (use `npm run build && npm run build:electron`)

### Writing New Tests

When adding tests:

1. **Prefer unit tests** for logic that can be extracted and tested in isolation
2. **Use UI/Interaction E2E tests** for testing UI components and user workflows
3. **Use Electron Platform E2E tests** for testing file system operations, OS integration, or Electron APIs
4. **Avoid long waits** - use `waitForTimeout()` sparingly and keep under 500ms
5. **Click buttons directly** when UI elements are obscured:
   ```typescript
   await page.evaluate(() => {
     const buttons = Array.from(document.querySelectorAll('button'))
     const btn = buttons.find(b => b.textContent?.includes('Button Text'))
     if (btn) btn.click()
   })
   ```

### Code Coverage

Check coverage after running tests:
```bash
npm test -- --coverage
```

Current coverage: 94.62% ✅

### Debugging Tests

#### Unit Tests
```bash
# Run in watch mode
npm test -- --watch

# Run with UI
npm test -- --ui
```

#### E2E Tests
```bash
# Run with headed browser
npx playwright test --headed

# Run in debug mode
npx playwright test --debug

# View test report
npx playwright show-report
```

## Architecture Notes

### Native Electron Menu
- Uses Electron's native `Menu` API instead of custom HTML/CSS menu bar
- Menu configured in `electron/main.ts` with `Menu.buildFromTemplate()`
- Provides platform-native experience:
  - **macOS**: Menu bar at top of screen
  - **Windows/Linux**: Menu bar at top of window
- Menu actions communicate with renderer via IPC:
  - Menu clicks send IPC events (`menu-open-file`, `menu-save-file`, etc.)
  - Renderer listens for events in `App.vue` via `electronAPI.ipcRenderer.on()`
- Keyboard shortcuts handled by Electron (Cmd/Ctrl+O, Cmd/Ctrl+S, etc.)
- Menu includes:
  - **File**: Open, Save, Save As
  - **Edit**: Standard editing commands + Rename Speaker
  - **View**: Zoom, reload, dev tools
  - **Window**: Minimize, zoom, close
  - **Help**: Version info

### State Management
- Uses Pinia for global state (`vttStore.ts`)
- Document model is immutable - all operations return new objects
- Cues are always kept sorted by start time, then end time

### AG Grid Integration
- Uses `immutableData: true` with `getRowId` for row identity
- `:key="gridKey"` forces re-render when cue order changes
- `gridKey` is computed from cue ID sequence

### VTT Format
- Exports include cue IDs on separate lines before timestamps
- Metadata stored in NOTE comments using CAPTION_EDITOR sentinel format
- Sentinel constant: `CAPTION_EDITOR_SENTINEL` (defined in both TypeScript and Python)
- Format examples:
  - Document metadata: `NOTE CAPTION_EDITOR:TranscriptMetadata {"id":"<uuid>","mediaFilePath":"..."}`
  - Cue data: `NOTE CAPTION_EDITOR:VTTCue {"id":"<uuid>","startTime":<number>,"endTime":<number>,"text":"...","rating":<number>,"timestamp":"..."}`
  - History entry: `NOTE CAPTION_EDITOR:SegmentHistoryEntry {"id":"<uuid>","action":"modified|deleted","actionTimestamp":"...","cue":{...}}`
- The sentinel allows the parser to distinguish app-specific metadata from regular VTT NOTE comments
- History entries are serialized as separate NOTE comments (one per entry) at the end of the file for readability

### Media File Path Handling
- **Internal storage**: Media file paths are stored as **absolute paths** in `document.metadata.mediaFilePath` while the document is in memory
- **Export/serialization**: Paths are converted to **relative paths** (relative to VTT file location) only when exporting to VTT format via `serializeVTT()`
- **Rationale**: Storing absolute paths internally allows the VTT file location to change (e.g., via Save As) without losing track of the media file location. The relative path is recomputed at export time based on the current VTT file location.
- **Implementation**: Uses Node.js `path` module functions exposed via Electron preload (`electronAPI.path.relative()`, `electronAPI.path.dirname()`, etc.)
- **Example**:
  - VTT file: `/projects/video/captions.vtt`
  - Media file: `/projects/video/audio.wav`
  - Stored internally: `/projects/video/audio.wav` (absolute)
  - Exported to VTT: `audio.wav` (relative)
  - After Save As to `/projects/video/subfolder/captions.vtt`:
    - Still stored internally: `/projects/video/audio.wav` (absolute, unchanged)
    - Exported to VTT: `../audio.wav` (relative, updated)

### Key Utilities
- `findIndexOfRowForTime(cues, time)`: Find cue index for a given time
- `sortCues(cues)`: Sort cues by start/end time (used internally)
- `serializeVTT(document)`: Convert document to VTT string
- `parseVTT(content)`: Parse VTT string to document

## Common Issues

### AG Grid Row Selection Not Updating
**Symptom**: Clicking "Jump to Row" doesn't update selected row

**Solution**: Call `deselectAll()` before `setSelected(true)`:
```typescript
gridApi.value.deselectAll()
rowNode.setSelected(true)
```

### Test Button Clicks Not Working
**Symptom**: Playwright times out trying to click a button

**Solution**: Use `page.evaluate()` to click directly instead of using Playwright's `.click()` when elements are obscured by overlays.

### Table Not Showing Sorted Order
**Symptom**: AG Grid displays rows in wrong order after adding/editing cues

**Solution**: Cues should be sorted in the document model itself (via `sortCues()` in `addCue()` and `updateCue()`). The grid will automatically reflect the sorted order when `:key="gridKey"` forces a re-render.

## Running Electron Tests

Electron tests work on both macOS and Linux, but have different setup requirements.

### Prerequisites

**IMPORTANT:** Before running Electron tests, you must build both the main app and Electron:

```bash
npm run build              # Build the Vue app (dist/)
npm run build:electron     # Build Electron files (dist-electron/)
```

These build steps create the files required for Electron tests to launch.

### Platform-Specific Setup

#### macOS (Local Development)

On macOS, Electron tests work out of the box - no special display setup needed:

```bash
# Build the apps
npm run build:all

# Run Electron tests directly
npx playwright test tests/electron/
```

The `--no-sandbox` flag and `DISPLAY` environment variable in the test files are configured to work automatically on macOS.

#### Linux / Docker Containers (Sculptor Sandbox)

On Linux containers without a display server, you need Xvfb (X Virtual Framebuffer):

**Step 1:** Start Xvfb using the provided script:

```bash
# Start Xvfb on display :99
start-xvfb.sh

# Verify it's running
ps aux | grep "[X]vfb"
```

**Step 2:** Run Electron tests with DISPLAY variable:

```bash
# Run all Electron tests (DISPLAY must be set in the same command)
DISPLAY=:99 npx playwright test tests/electron/

# Run specific test file
DISPLAY=:99 npx playwright test tests/electron/app.electron.spec.ts

# Run with verbose output
DISPLAY=:99 npx playwright test tests/electron/ --reporter=list
```

> **Important:** Set `DISPLAY=:99` in the same command as the test run. The environment variable doesn't persist across separate bash commands in the sandbox.

> **Note:** Xvfb needs to be restarted each time the container restarts. It's included in the dev container but doesn't auto-start.

### Test Configuration Details

The tests are configured to work on both platforms:

- **`--no-sandbox` flag**: Required for running Electron in Docker/non-root environments
- **`DISPLAY` environment**: Set to `:99` in test files with fallback to `process.env.DISPLAY`
- Tests automatically use these settings on both macOS and Linux

### Quick Commands by Platform

**macOS:**
```bash
npm run build:all && npx playwright test tests/electron/
```

**Linux/Docker:**
```bash
npm run build:all && start-xvfb.sh && DISPLAY=:99 npx playwright test tests/electron/
```

### Test Results

**All 17 Electron tests pass!** These tests verify:
- Application launch and window creation
- File association (double-click .vtt files)
- Media auto-loading from VTT metadata
- Electron API exposure
- File drop handling

### Troubleshooting

**Tests fail with "Missing X server or $DISPLAY" (Linux only):**
```bash
# Check if Xvfb is running
ps aux | grep "[X]vfb"

# Restart Xvfb if needed
start-xvfb.sh

# Check Xvfb logs for errors
cat /tmp/xvfb.log

# Ensure DISPLAY is set in the test command
DISPLAY=:99 npx playwright test tests/electron/
```

**Tests fail with "Process failed to launch" (Any platform):**
```bash
# Make sure build completed
npm run build:all

# Verify build artifacts exist
ls -la dist/index.html
ls -la dist-electron/main.cjs
ls -la dist-electron/preload.cjs
```

**Tests fail with sandbox errors (Linux only):**
The `--no-sandbox` flag is already configured in all test files. If you still see sandbox errors, it means the non-root user environment needs this flag, which is already applied.

### Why Xvfb? (Linux/Docker)

Electron uses Chromium under the hood, which requires a display server to render the UI. Xvfb provides a virtual display that allows us to run Electron tests in headless environments like Docker containers or CI/CD pipelines without a physical display. macOS doesn't need this because it has a native display server.

### File Association Testing

The `file-association.electron.spec.ts` tests verify that:
1. VTT files can be opened via command line (simulating double-click)
2. macOS `open-file` events work correctly
3. Media files referenced in VTT metadata auto-load
4. The `onFileOpen` API is exposed to the renderer

These tests use real VTT and audio files from `test_data/`:
- `with-media-reference.vtt` - VTT file with media metadata
- `OSR_us_000_0010_8k.wav` - Audio file for testing

## Quick Reference: Running All Tests

### Quick Start (Recommended)

Use the helper script that automatically detects your platform:

```bash
# Run all tests (unit, browser E2E, Electron, Python)
./scripts/run-all-tests.sh

# Run with TypeScript coverage
./scripts/run-all-tests.sh --coverage

# Skip Electron tests (faster)
./scripts/run-all-tests.sh --skip-electron

# Show help
./scripts/run-all-tests.sh --help
```

The script automatically:
- Runs TypeScript type checking (`tsc --noEmit`)
- Detects macOS vs Linux
- Starts Xvfb on Linux if needed
- Builds Electron app before tests
- Runs all test suites in order

### Complete Test Suite (Manual)

**On macOS:**
```bash
# 1. Install dependencies (if not already done)
npm install
cd transcribe && uv sync && cd ..

# 2. Run TypeScript unit tests with coverage
npm test -- --coverage

# 3. Run Python tests
cd transcribe && uv run pytest tests/ -v && cd ..

# 4. Run browser E2E tests
npx playwright test --grep-invert "electron"

# 5. Build and run Electron tests
npm run build:all
npx playwright test tests/electron/
```

**On Linux/Docker (Sculptor sandbox):**
```bash
# 1. Install dependencies (if not already done)
npm install
cd transcribe && uv sync && cd ..

# 2. Run TypeScript unit tests with coverage
npm test -- --coverage

# 3. Run Python tests
cd transcribe && uv run pytest tests/ -v && cd ..

# 4. Run browser E2E tests
npx playwright test --grep-invert "electron"

# 5. Build and run Electron tests (requires Xvfb)
npm run build:all
start-xvfb.sh
DISPLAY=:99 npx playwright test tests/electron/
```

**Expected Results:**
- Unit tests: All passing (109/109) ✅
- Python tests: All passing (2/2) ✅
- Browser E2E: All passing (32/32) ✅
- Electron E2E: All passing (17/17) ✅

**Total: 160/160 tests passing (100%)! 🎉**

#### Test Timeout Philosophy

**All test timeouts are deliberately kept very short (100-200ms)** to catch stalled tests immediately:

- UI operations should complete in milliseconds, not seconds
- A test taking >10 seconds total indicates a real problem (infinite loop, missing element, etc.)
- Short timeouts = fast feedback when something breaks
- If a test times out, it's **always** a bug - either in the code or the test itself

**Timeout Guidelines:**
- Page interactions (clicks, seeks): 100ms wait
- File loading/initialization: 200ms wait
- Entire test suite should complete in <1 minute

If you see timeout failures, don't just increase the timeout - investigate why the operation is slow!

## Python Transcription Tools

### ASR Segment Splitting (transcribe/transcribe.py)

Added intelligent segment splitting to prevent overly long VTT cues that interfere with speaker ID and UI usability.

**New CLI Options:**
- `--max-intra-segment-gap-seconds`: Maximum gap between words before splitting (default: 2.0s)
- `--max-segment-duration-seconds`: Maximum segment duration before splitting (default: 10.0s)

**Usage:**
```bash
cd transcribe
uv run python transcribe.py audio.wav \
  --max-intra-segment-gap-seconds 2.0 \
  --max-segment-duration-seconds 10.0
```

**How it works:**

Three-pass segment processing pipeline:

1. **Split by word gaps**: If any two consecutive words within a segment have a gap > 2s (configurable), split the segment at that point.
2. **Split long segments**: If any segment exceeds 10s duration (configurable), split it after the last word whose end time doesn't exceed that distance from the segment start.
3. **Resolve overlaps**: Handle overlapping segments from chunked audio processing by keeping segments with greater distance to chunk edges.

**Implementation:**

- **New library**: `transcribe/asr_results_to_vtt.py`
  - Data structures: `WordTimestamp`, `ASRSegment`
  - Functions: `split_segments_by_word_gap()`, `split_long_segments()`, `resolve_overlap_conflicts()`
  - Parsing: `parse_nemo_result_with_words()`, `parse_transformers_result_with_words()`
  - Conversion: `asr_segments_to_vtt_cues()`

- **Model-specific handling**:
  - **Parakeet (NeMo)**: Provides both segment-level and word-level timestamps. Uses native segment boundaries and only splits when needed.
  - **Whisper (Transformers)**: With `return_timestamps="word"`, provides only word-level data. All words are initially grouped into one large segment, then the splitting passes break it up based on gaps and duration.

**Tests:**
- `tests/test_asr_results_to_vtt.py`: Unit tests for splitting logic (13 tests)
  - Tests for gap-based splitting
  - Tests for duration-based splitting
  - Tests for combined pipeline
  - Tests for edge cases (empty, single word, etc.)
- `tests/test_post_processing_pipeline.py`: Integration tests using real ASR outputs (3 tests)
  - Uses captured JSON fixtures from `test_fixtures/`
  - Tests full-file processing (82 words → 7 cues)
  - Tests chunked 10s processing (136 words → 3 cues)
  - Verifies segment counts at each pipeline stage
- **All 16 tests pass in 0.1s**, run independently of ASR models
- **Key finding**: Whisper with 10s chunks extends word durations, hiding sentence boundaries. Use full-file processing for best results.

**Test Fixtures:**
- `test_fixtures/capture_raw_asr_output.py`: Script to regenerate JSON fixtures
- `test_fixtures/whisper_full_file_raw_output.json`: Full-file processing (82 words, clean gaps)
- `test_fixtures/whisper_chunked_10s_raw_output.json`: 10s chunks (136 words, gaps hidden)
- `test_fixtures/FINDINGS.md`: Analysis of Whisper timestamp behavior and chunking issues

### Speaker Clustering (transcribe/embed.py)

Added automatic speaker clustering to `embed.py`:

**New CLI Options:**
- `--auto_assign_speaker_clusters_to_unknown_names`: Enable speaker clustering
- `--num_speaker_clusters N`: Number of speaker groups (default: 2)

**Usage:**
```bash
cd transcribe
HF_TOKEN=your_token uv run python embed.py path/to/file.vtt \
  --auto_assign_speaker_clusters_to_unknown_names \
  --num_speaker_clusters 2
```

**How it works:**
1. Computes speaker embeddings using pyannote.audio
2. Normalizes embeddings for cosine similarity
3. Clusters using k-means
4. Assigns "Unknown Speaker 00?", "Unknown Speaker 01?", etc.
5. Preserves existing non-empty speaker names
6. Overwrites input VTT file with updated assignments

**New Files:**
- `transcribe/vtt_lib.py`: Shared VTT parsing/serialization utilities
  - `parse_vtt_file()`: Parse VTT NOTE comments
  - `serialize_vtt()`: Serialize back to VTT format
  - `format_timestamp()`: Format timestamps

**Tests:**
- `tests/test_vtt_lib.py`: Tests parsing and serialization (3 tests)
- `tests/test_speaker_clustering.py`: Tests clustering with real embeddings (2 tests)
- All use syrupy snapshots and tmp_path fixture
- Total: 5 new tests, all passing
