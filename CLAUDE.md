# Claude Development Notes

## Important Reminders

**DO NOT create summary/readme files like CLUSTERING_README.md, IMPLEMENTATION_SUMMARY.md, etc.**
- Just update this CLAUDE.md file with notes
- Users can read the code and tests to understand features
- If documentation is needed, ask the user first

## Development Workflow

### Version Management

**IMPORTANT: When changing Node.js/TypeScript code, bump the Electron app version by 0.01!**

After making changes to Node.js/TypeScript code:
1. Open the `VERSION` file at the root of the project
2. Increment the version by 0.01 (e.g., `1.2.1` → `1.2.2`)
3. This ensures users can track which version they're running and helps with debugging

**Why VERSION file instead of package.json?**
- The `VERSION` file is not used by the Dockerfile (`.devcontainer/Dockerfile`)
- Changes to `package.json` trigger expensive Docker rebuilds
- Keeping version tracking separate avoids unnecessary rebuild cycles

### DevContainer Performance

**The devcontainer uses npm cache pre-population for fast startup:**

**How it works:**
1. **Dockerfile** runs `npm ci` to populate npm's cache at `/home/dev/.npm` (happens during image build)
2. **postCreateCommand** runs `npm ci` which is fast because it uses the pre-populated cache
3. **Benefit**: Works even when `package.json`/`package-lock.json` change, because npm cache contains most packages

**Why this approach:**
- npm's cache is **content-addressable** (keyed by package name + version)
- Even if dependencies change, most packages are already cached
- No Docker layer invalidation issues
- Fast installs even when package.json changes

**DO NOT modify the caching strategy** unless you understand the performance implications. The current approach balances:
- Fast container startup (cached packages)
- Robustness to dependency changes (npm cache persists)
- Simple maintenance (no complex layer caching logic)

**Performance expectations:**
- With warm npm cache: `npm ci` completes in ~10-20 seconds
- With cold cache (first build): `npm ci` takes ~60-90 seconds
- Python venv is also pre-created in Docker image for fast startup

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
npm run test:unit
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
- ✅ TypeScript Unit Tests: 187/187 passing ⭐ **ALL PASSING!**
  - Includes 27 tests for word timestamp preservation (`realignWords`)
  - Includes 10 tests for sequential playback (`vttStore.sequential.test.ts`)
- ✅ Python Tests: 24/24 passing ⭐ **ALL PASSING!**
  - ✅ **ASR Segment Splitting**: 13/13 passing (unit tests)
  - ✅ **ASR Post-Processing Pipeline**: 4/4 passing (integration tests with fixtures)
  - ✅ **VTT Parsing/Serialization**: 3/3 passing
  - ✅ **Embedding**: 2/2 passing (no HF_TOKEN required for default model)
  - ✅ **Transcription**: 2/2 passing (Whisper + Parakeet)
- ✅ UI/Interaction E2E Tests: 43/43 passing ⭐ **ALL PASSING!**
- ✅ Electron Platform E2E Tests: 28/28 passing ⭐ **ALL PASSING!**
  - Includes 3 tests for ASR menu integration (`asr-menu.electron.spec.ts`)

**Total: 282/282 tests passing (24 Python + 258 TypeScript) - 100% pass rate!** ⭐

**Note:** All E2E tests run in Electron only (no browser mode). The default `playwright test` command launches Electron automatically after building.

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

# E2E tests (all run in Electron)
npm run test:e2e              # Build and run all E2E tests
npm run test:e2e:ui           # Build and run E2E tests with Playwright UI
npm run test:e2e:headed       # Build and run E2E tests with visible window

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

**All E2E tests run in Electron** (no browser mode). The npm scripts automatically build the app first.

```bash
# Run all E2E tests (recommended - uses npm script with auto-build)
npm run test:e2e

# Or manually with platform-specific DISPLAY (Linux only):
# macOS:
npm run build:all && npx playwright test

# Linux/Docker (requires Xvfb):
npm run build:all && start-xvfb.sh && DISPLAY=:99 npx playwright test
```

Current performance: ~40-60s for all E2E tests ✅

**Full E2E Pipeline Test (Python + Electron):**

This test covers the complete workflow from audio transcription to UI editing:

```bash
# Fast mode (uses cached intermediate files, recommended)
# macOS:
npx playwright test tests/electron/full-pipeline.electron.spec.ts

# Linux/Docker:
DISPLAY=:99 npx playwright test tests/electron/full-pipeline.electron.spec.ts

# Full E2E mode (regenerates all intermediate files from scratch)
# Note: Default embedding model (wespeaker) doesn't require HF_TOKEN
# macOS:
FULL_E2E=1 npx playwright test tests/electron/full-pipeline.electron.spec.ts

# Linux/Docker:
DISPLAY=:99 FULL_E2E=1 npx playwright test tests/electron/full-pipeline.electron.spec.ts
```

Pipeline stages (intermediate outputs in `test_data/full_pipeline/`):
1. **Stage 1**: `1_after_transcribe.vtt` - Audio transcription with `transcribe.py`
2. **Stage 2**: `2_after_embed.vtt` - Speaker embeddings added with `embed.py`
3. **Stage 3**: `3_after_ui_edit.vtt` - UI modifications (rating, speaker name)

The test verifies:
- Speaker embeddings are preserved after UI edits
- Rating modifications persist correctly
- Speaker name updates are saved properly

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
- Core splitting tests: ~0.1s for 13 tests (no ASR required) ✅
- Post-processing pipeline tests: ~0.1s for 4 tests (use fixtures) ✅
- VTT parsing tests: ~0.1s for 3 tests ✅
- Embedding test: ~10s for 1 test (uses public wespeaker model) ✅
- Audio conversion test: ~1s for 1 test ✅
- Transcription tests: ~180s for 2 tests (Whisper + Parakeet, require HF_TOKEN) ✅
- Total: ~3 minutes for 24 tests (all passing, transcription tests require HF_TOKEN) ⭐

#### Run Specific Test Files
```bash
# TypeScript unit test
npm test src/utils/findIndexOfRowForTime.test.ts

# E2E test (macOS)
npx playwright test vtt-editor.spec.ts

# E2E test (Linux/Docker - requires Xvfb running)
DISPLAY=:99 npx playwright test vtt-editor.spec.ts

# Electron-specific test (macOS)
npx playwright test tests/electron/file-save.electron.spec.ts

# Electron-specific test (Linux/Docker)
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
npm run test:unit:coverage      # Unit tests with coverage (non-watch mode)
npx playwright test              # All E2E tests
cd transcribe && uv run pytest tests/ -v  # Python tests
```

**Important:** Use `npm run test:unit` for non-watch mode. The `npm test` command runs vitest in watch mode and will wait for input.

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
- Run in Electron (launched automatically by Playwright)
- Keep tests focused and efficient

#### Electron Platform E2E Tests (`tests/electron/*.spec.ts`)
- Test Electron-specific features
- File system operations, OS integration (file associations), IPC
- Test file loading/saving with full paths
- Run in Electron (launched automatically by Playwright)

**Note:** All E2E tests require the app to be built first with `npm run build:all`. The npm scripts handle this automatically.

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
  - **Speaker**: Rename Speaker, Sort by Similarity
  - **AI Annotations**: Caption with Speech Recognizer
  - **View**: Zoom, reload, dev tools
  - **Window**: Minimize, zoom, close
  - **Help**: Version info

### AI Annotations Menu (ASR Integration)

The app includes a native menu item to run speech recognition on loaded media files, automatically generating VTT captions.

**Menu Item:**
- **AI Annotations → Caption with Speech Recognizer**
- Enabled only when a media file is loaded
- Runs Python ASR subprocess (`transcribe/transcribe.py`)

**Features:**
- **Modal UI**: Shows real-time terminal output (stdout/stderr) from the Python subprocess
- **Progress tracking**: Displays tqdm progress bars and colored output from the ASR script
- **Confirmation dialog**: Warns before deleting existing captions
- **Cancel support**: Kill button to terminate the running subprocess
- **Error handling**: Modal stays open on failure with red "Close Failed ASR Run" button
- **Auto-load**: Generated VTT file is automatically loaded into the editor on success

**Architecture:**

**Dev Mode vs Production:**
- **Dev mode** (when running tests or `npm run dev:electron`):
  - Uses `uv run python transcribe.py` to execute the ASR script
  - Fast startup, no packaging overhead
  - Leverages existing uv environment at `/code/transcribe/`
- **Production mode** (packaged app):
  - Uses `uvx` to run directly from GitHub repository at a specific commit hash
  - No Python bundling required - much smaller app size!
  - Requires `uv` to be installed on the user's system
  - Fetches and caches dependencies automatically on first run
  - Command: `uvx --from git+https://github.com/thadd3us/caption_editor@<hash>#subdirectory=transcribe --overrides overrides.txt transcribe`

**Environment Variables for Dev Mode:**
To force dev mode execution (useful when Electron is packaged but you want to run from code tree):
- `CAPTION_EDITOR_RUN_TRANSCRIBE_FROM_CODE_TREE=1` - Forces dev mode (uses `uv run python`)
- `CAPTION_EDITOR_CODE_TREE_ROOT=/path/to/code` - Specifies code tree root (defaults to computing from `__dirname`)

**Example usage:**
```bash
CAPTION_EDITOR_RUN_TRANSCRIBE_FROM_CODE_TREE=1 \
CAPTION_EDITOR_CODE_TREE_ROOT=/Users/thad/src/caption_editor \
/Applications/VTT\ Caption\ Editor.app/Contents/MacOS/VTT\ Caption\ Editor
```

**Detection:**
```typescript
const runFromCodeTree = process.env.CAPTION_EDITOR_RUN_TRANSCRIBE_FROM_CODE_TREE === '1'
const isDev = runFromCodeTree || process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL
```

**Model Configuration:**
- **Default model**: `nvidia/parakeet-tdt-0.6b-v3` (best quality)
- **Default chunk size**: 300 seconds (5 minutes) - passed via `--chunk-size` flag
- **Test override**: Set `window.__ASR_MODEL_OVERRIDE` to use a different model (e.g., `'openai/whisper-tiny'` for faster testing)
- Model is passed via `--model` flag to `transcribe.py`

**IPC Architecture:**
- **Main process** (`electron/main.ts`):
  - `asr:transcribe` handler spawns Python subprocess
  - Streams stdout/stderr to renderer via `asr:output` events
  - Sends `asr:started` event with process ID
  - Returns success with VTT path, or rejects with error
- **Renderer** (`App.vue`):
  - Listens for `menu-asr-caption` event from menu
  - Shows confirmation dialog if segments exist
  - Displays ASR modal with real-time output
  - Loads generated VTT file on success

**Components:**
- `src/components/AsrModal.vue`: Terminal output modal with cancel button
- `src/components/ConfirmAsrDialog.vue`: Warning dialog for overwriting existing captions
- Handlers in `App.vue`: `handleMenuAsrCaption()`, `startAsrTranscription()`, `handleAsrCancel()`

**Testing:**
- E2E test: `tests/electron/asr-menu.electron.spec.ts`
- Tests ASR with `whisper-tiny` model (faster than default)
- Verifies modal display, output streaming, VTT generation, and segment loading
- Includes test for confirmation dialog when segments exist
- Includes test for menu disabled state when no media loaded

**Production Mode Setup:**
- **User requirement**: `uv` must be installed on the user's system
  - Installation: `curl -LsSf https://astral.sh/uv/install.sh | sh`
  - Documentation: https://docs.astral.sh/uv/getting-started/installation/
- **Packaged files**: Only `overrides.txt` is bundled (in `process.resourcesPath`)
  - Configured in `electron-builder.json` under `extraResources`
  - File location in packaged app: `<app>/Contents/Resources/overrides.txt`
- **Commit hash**: Update `electron/main.ts` when releasing new versions
  - Change `const commitHash = 'f8bcf53'` to the desired commit
  - Or use a git tag: `const commitHash = 'v1.3.4'`
- **First run**: `uvx` automatically downloads and caches Python dependencies
- **Error handling**: Clear error message if `uvx` is not found on PATH

### State Management
- Uses Pinia for global state (`vttStore.ts`)
- Document model is immutable - all operations return new objects
- Cues are always kept sorted by start time, then end time

### AG Grid Integration
- Uses `getRowId` for row identity (tracks rows by ID)
- Removed `immutableData: true` and `:key` binding to avoid bugs
- Known AG Grid bugs:
  1. **Ghost rows**: Empty duplicate rows appear during updates (workaround: filter by content in tests)
  2. **Row ordering**: DOM doesn't update when array order changes (rows stay in insertion order)

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
- `realignWords(originalWords, editedText)`: Preserve word-level timestamps after user edits

### Word Timestamp Preservation

When users edit transcript text, we preserve word-level timestamps for unchanged words using the `realignWords()` utility (`src/utils/realignWords.ts`).

**How it works:**
- Uses LCS (Longest Common Subsequence) algorithm for optimal word-level alignment
- Case-insensitive matching preserves timestamps even when capitalization changes
- New/modified words get entries without timestamps (`startTime`/`endTime` undefined)
- Unchanged words keep their original ASR timestamps

**Usage example:**
```typescript
import { realignWords } from './utils/realignWords'

const originalWords = [
  { text: 'Hello', startTime: 1.0, endTime: 1.2 },
  { text: 'world', startTime: 1.3, endTime: 1.5 }
]

// User edits: "Hello beautiful world"
const result = realignWords(originalWords, 'Hello beautiful world')

// Result:
// [
//   { text: 'Hello', startTime: 1.0, endTime: 1.2 },   // preserved
//   { text: 'beautiful' },                              // new (no timestamp)
//   { text: 'world', startTime: 1.3, endTime: 1.5 }    // preserved
// ]
```

**Test coverage:**
- 27 unit tests covering edge cases, insertions, deletions, replacements, capitalization
- Performance test: handles 1000 words in <200ms
- See `src/utils/realignWords.test.ts` for comprehensive examples

### Sequential Segment Playback

The sequential playback feature allows playing segments in table order while skipping intervening silence. This is especially useful when playing segments sorted by speaker similarity, rating, or other criteria.

**How it works:**
- "Play Sequential" button in CaptionTable header starts playback
- Plays segments in current table display order (respects sorting/filtering)
- Starts from currently selected row, or top of table if none selected
- Automatically advances to next segment when current segment ends
- Skips gaps between segments by jumping directly to next start time
- Button changes to "Pause Sequential" during playback
- Auto-scroll feature updates row selection as segments play

**Key features:**
- **Respects table order**: Uses AG Grid's `forEachNodeAfterFilterAndSort()` to capture current display order
- **Preserves playlist**: Playlist is captured once at start; resorting table during playback doesn't change the playlist
- **Unified playback**: Sequential and single-segment playback share the same codepath via `MediaPlayer.onTimeUpdate()`
- **State isolation**: Sequential mode (`sequentialMode`) and snippet mode (`snippetMode`) are mutually exclusive

**Implementation:**

**Store state** (`vttStore.ts`):
- `sequentialMode`: Boolean flag indicating sequential playback is active
- `sequentialPlaylist`: Array of segment IDs in playback order
- `sequentialPlaylistIndex`: Current position in playlist
- `currentSequentialSegment`: Computed property for current segment

**Store actions** (`vttStore.ts`):
- `startSequentialPlayback(segmentIds, startIndex)`: Begin sequential playback
- `stopSequentialPlayback()`: Stop and clear playlist
- `nextSequentialSegment()`: Advance to next segment (returns false at end)

**Media player** (`MediaPlayer.vue`):
- `onTimeUpdate()`: Detects segment end and advances to next segment
- Watch `isPlaying`: Sets up sequential playback when it starts
- Uses `snippetEndTime` to track when to advance

**UI** (`CaptionTable.vue`):
- `toggleSequentialPlayback()`: Button click handler
- Collects segment IDs using `forEachNodeAfterFilterAndSort()`
- Finds start index from selected row
- Button label computed based on `sequentialMode`

**Test coverage:**
- 10 unit tests (`src/stores/vttStore.sequential.test.ts`):
  - Start from index 0 and specific index
  - Get current segment
  - Advance to next segment
  - Reach end of playlist
  - Stop sequential playback
  - Handle empty segment list
  - Disable snippet mode when starting
  - Preserve playlist order
  - Handle advancing when not in sequential mode
- 9 E2E tests (`tests/sequential-playback.spec.ts`):
  - Show sequential play button
  - Start from top when no row selected
  - Start from selected row
  - Stop when pause button clicked
  - Play segments in table order
  - Advance to next segment
  - Preserve playlist order even if table resorted
  - Disable button when no media loaded
  - Work with single segment playback

**Manual testing recommendations:**
- Load a VTT file with multiple segments (5+)
- Load the associated media file
- Click "Play Sequential" and verify:
  - Segments play in order without gaps
  - Row selection updates as segments play
  - Button changes to "Pause Sequential"
- Click "Pause Sequential" and verify:
  - Playback stops
  - Button changes back to "Play Sequential"
  - Can resume from current position
- Sort the table by a different column and repeat
- Select a row in the middle and start sequential playback
  - Should start from selected row, not top

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

### AG Grid Ghost Rows
**Symptom**: AG Grid shows duplicate empty rows with same row-id

**Root Cause**: AG Grid bug during updates - creates duplicate row nodes

**Solution**: In tests, filter rows by content before counting:
```typescript
const rowsWithContent = allRows.filter((row: any) => {
  const text = row.textContent?.trim() || ''
  return text.length > 0
})
```

### AG Grid Row Ordering
**Symptom**: AG Grid displays rows in insertion order, not sorted by start time

**Root Cause**: AG Grid with `getRowId` tracks rows by ID and doesn't reorder DOM when array changes

**Solution**: In tests, sort rows by start time before accessing:
```typescript
const rowsWithTimes = await Promise.all(
  rowsWithContent.map(async (row) => {
    const timeText = await row.locator('[col-id="startTime"]').textContent()
    return { row, timeText }
  })
)
rowsWithTimes.sort((a, b) => (a.timeText || '').localeCompare(b.timeText || ''))
const sortedRows = rowsWithTimes.map(r => r.row)
```

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

On Linux containers without a display server, you need Xvfb (X Virtual Framebuffer).

**In the devcontainer:**
- Xvfb auto-starts on container start via `postStartCommand`
- `DISPLAY=:99` is automatically set in the environment

```bash
# Build and run Electron tests (DISPLAY already set)
npm run build:all
npx playwright test tests/electron/

# Run specific test file
npx playwright test tests/electron/app.electron.spec.ts

# Run with verbose output
npx playwright test tests/electron/ --reporter=list
```

**Outside the devcontainer (manual setup):**

If Xvfb is not running, start it manually:

```bash
# Start Xvfb on display :99
start-xvfb.sh

# Verify it's running
ps aux | grep "[X]vfb"

# Run tests with DISPLAY set
DISPLAY=:99 npx playwright test tests/electron/
```

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

**Linux/Docker (devcontainer):**
```bash
npm run build:all && npx playwright test tests/electron/
```

**Linux/Docker (manual setup):**
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

#### Tests fail with "Missing X server or $DISPLAY" (Linux only)

**Quick fix:**
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

#### Why Xvfb Keeps Dying

**Common causes:**

1. **Zombie Electron processes holding the display**
   - When tests crash or are killed (Ctrl+C), Electron processes can linger
   - These hold onto `:99` display, preventing Xvfb from restarting cleanly
   - **Solution:** Kill zombie processes before restarting Xvfb

2. **Stale lock files**
   - Lock file `/tmp/.X99-lock` persists after Xvfb dies
   - New Xvfb can't start because it thinks display is in use
   - **Solution:** Remove stale lock files

3. **Out of memory**
   - Multiple Electron instances running simultaneously can exhaust memory
   - Xvfb gets OOM killed by the kernel
   - **Solution:** Run tests sequentially, not in parallel

4. **Multiple Xvfb instances**
   - Starting Xvfb twice creates conflicts
   - Second instance dies immediately
   - **Solution:** Check if already running before starting

**Comprehensive cleanup and restart:**
```bash
# 1. Kill all Xvfb processes
pkill Xvfb

# 2. Kill all zombie Electron processes (important!)
pkill -9 electron

# 3. Remove stale lock files
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99

# 4. Verify nothing is running
ps aux | grep -E "(Xvfb|electron)" | grep -v grep

# 5. Start fresh Xvfb
start-xvfb.sh

# 6. Verify it's running
ps aux | grep "[X]vfb"
```

**Monitoring and debugging:**
```bash
# Check if Xvfb is running (won't match grep itself)
ps aux | grep "[X]vfb"

# Get Xvfb PID
pgrep Xvfb

# Check Xvfb logs (warnings about keysyms are normal)
cat /tmp/xvfb.log

# Check for stale lock files
ls -lh /tmp/.X99-lock

# Find zombie Electron processes
ps aux | grep electron | grep -v grep

# Kill all Electron processes if tests are stuck
pkill -9 electron

# Check memory usage (OOM can kill Xvfb)
free -h

# Monitor Xvfb memory usage
ps aux | grep "[X]vfb" | awk '{print $6}'  # RSS in KB
```

**Performance measurement:**
```bash
# Use GNU time to measure test performance
/usr/bin/time -v DISPLAY=:99 npx playwright test tests/electron/asr-menu.electron.spec.ts

# Key metrics:
# - Elapsed (wall clock) time: Total duration
# - User time: CPU time in user mode
# - System time: CPU time in kernel mode
# - Percent of CPU: Multi-core utilization (>100% = parallel)
# - Maximum resident set size: Peak memory usage
```

**Best practices:**
- Always set `DISPLAY=:99` in the same command as your test run (doesn't persist)
- Kill zombie Electron processes after interrupted tests
- Run `pkill Xvfb && start-xvfb.sh` if you see display errors
- Check `/tmp/xvfb.log` if Xvfb fails to start

#### Tests fail with "Process failed to launch" (Any platform)

```bash
# Make sure build completed
npm run build:all

# Verify build artifacts exist
ls -la dist/index.html
ls -la dist-electron/main.cjs
ls -la dist-electron/preload.cjs
```

#### Tests fail with sandbox errors (Linux only)

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
# Run all tests (unit, E2E/Electron, Python)
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

# 4. Build and run E2E tests (all in Electron)
npm run build:all
npx playwright test
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

# 4. Build and run E2E tests (all in Electron, requires Xvfb)
npm run build:all
start-xvfb.sh
DISPLAY=:99 npx playwright test
```

**Expected Results:**
- Unit tests: All passing (164/164) ✅
- Python tests: All passing (24/24, transcription tests require HF_TOKEN) ✅
- UI/Interaction E2E tests: 43/43 passing ✅
- Electron Platform E2E tests: 25/25 passing ✅

**Total: 256/256 tests passing (100%)!** ⭐

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

### UVX Distribution (GitHub Actions)

The Python transcription tools can be distributed as uvx-compatible artifacts via GitHub Actions.

**How to create a release:**

1. **Manual trigger** via GitHub Actions UI:
   - Go to Actions → "Build UVX Artifact"
   - Click "Run workflow"
   - Enter version (e.g., `1.0.0`)
   - Check "Create GitHub release" to publish
   - Artifacts are uploaded to GitHub release with tag `uvx-v{version}`

2. **What gets built:**
   - **Wheel** (`.whl`): Binary distribution (~23KB)
   - **Source distribution** (`.tar.gz`): Source code with metadata
   - **overrides.txt**: Dependency overrides for uvx (see below)

**Usage with uvx:**

```bash
# Download overrides.txt (needed once)
curl -O https://github.com/YOUR_ORG/YOUR_REPO/releases/download/uvx-v1.0.0/overrides.txt

# Run transcribe directly (dependencies fetched on first run)
uvx --from https://github.com/YOUR_ORG/YOUR_REPO/releases/download/uvx-v1.0.0/transcribe-1.0.0-py3-none-any.whl \
    --overrides overrides.txt \
    transcribe audio.wav

# Run embed
uvx --from https://github.com/YOUR_ORG/YOUR_REPO/releases/download/uvx-v1.0.0/transcribe-1.0.0-py3-none-any.whl \
    --overrides overrides.txt \
    embed captions.vtt
```

**Why overrides.txt?**

The `overrides.txt` file is needed because:
- **nemo-toolkit 2.5.2** publishes metadata with `numpy>=1.22,<2.0`
- This is overly conservative - NeMo actually works fine with numpy 2.x
- The constraint was [fixed by NVidia](https://github.com/NVIDIA-NeMo/NeMo/issues/14505) but not yet in published releases
- `overrides.txt` tells uvx: "ignore nemo's constraint, use numpy>=2.0"

**Local packaging script:**

```bash
./scripts/package-for-uvx.sh
```

This creates artifacts in `dist-uvx/` with wheel, source dist, and overrides.txt.

**Files:**
- **Script**: `scripts/package-for-uvx.sh` - Build wheel, sdist, and overrides.txt
- **Workflow**: `.github/workflows/uvx-artifact.yml` - GitHub Actions workflow
- **Overrides**: `dist-uvx/overrides.txt` - Dependency overrides for uvx users

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

### Speaker Embeddings (transcribe/embed.py)

Computes speaker embeddings and stores them in the VTT file as NOTE comments.

**Usage:**
```bash
cd transcribe
# Default model (wespeaker) - no token required
uv run python embed.py path/to/file.vtt

# Alternative gated models require HF_TOKEN
HF_TOKEN=your_token uv run python embed.py path/to/file.vtt --model pyannote/embedding
```

**How it works:**
1. Skips segments shorter than 0.3 seconds (too short for reliable embeddings)
2. Computes speaker embeddings using pyannote.audio
3. Writes embeddings to VTT file as `SegmentSpeakerEmbedding` NOTE comments
4. Each embedding is a vector of floats associated with a segment ID

**Default model:**
- `pyannote/wespeaker-voxceleb-resnet34-LM` - 256-dimensional embeddings
- Publicly accessible (no HF token required)
- Good for speaker clustering and similarity analysis

**Implementation details:**
- Uses a map-based approach: `segment_id -> embedding`
- Embeddings are stored in the VTT file format:
  ```
  NOTE CAPTION_EDITOR:SegmentSpeakerEmbedding {"segmentId":"uuid","speakerEmbedding":[0.1,0.2,...]}
  ```
- Short segments (<0.3s) don't get embeddings
- Embeddings are parsed and preserved by both Python and TypeScript parsers
- Can be used later for speaker clustering, diarization, or similarity analysis

**New Files:**
- `transcribe/vtt_lib.py`: Shared VTT parsing/serialization utilities
  - `parse_vtt_file()`: Parse VTT NOTE comments
  - `serialize_vtt()`: Serialize back to VTT format
  - `format_timestamp()`: Format timestamps

**Tests:**
- `tests/test_vtt_lib.py`: Tests parsing and serialization (3 tests)
- `tests/test_embed.py::test_embed_osr_audio`: Tests embedding computation with VTT file (1 test, no HF_TOKEN required)
- `tests/test_embed.py::test_convert_to_wav`: Tests audio format conversion (1 test)
- All use syrupy snapshots and tmp_path fixture
- Total: 5 tests, all passing
