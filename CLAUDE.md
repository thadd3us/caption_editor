# Claude Development Notes

## Testing Guidelines

### Performance Requirements

Tests should run quickly to maintain development velocity:

- **Unit tests**: Maximum 4 seconds total
- **E2E tests**: Maximum 25 seconds total

### Test Status Overview

**Current Test Suite Status:**
- ✅ TypeScript Unit Tests: 96/96 passing ⭐ **ALL PASSING!**
- ✅ Python Tests: 2/2 passing ⭐ **ALL PASSING!**
- ✅ UI/Interaction E2E Tests: 15/15 passing ⭐ **ALL PASSING!**
- ✅ Electron Platform E2E Tests: 23/23 passing ⭐ **ALL PASSING!**

**Total: 136/136 tests passing (100%)! 🎉**

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
npm run build && npm run build:electron && npx playwright test tests/electron/

# Linux/Docker (requires Xvfb):
npm run build && npm run build:electron && start-xvfb.sh && DISPLAY=:99 npx playwright test tests/electron/
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

Current performance: ~56s for 2 tests with AI model inference ✅

#### Run Specific Test Files
```bash
# TypeScript unit test
npm test src/utils/findIndexOfRowForTime.test.ts

# UI/Interaction E2E test
npx playwright test vtt-editor.spec.ts

# Electron Platform E2E test
npx playwright test tests/electron/file-save.electron.spec.ts

# Python test
cd transcribe
uv run pytest tests/test_transcribe.py -v

# With specific test function
uv run pytest tests/test_transcribe.py::test_transcribe_osr_audio -v
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
  - Cue metadata: `NOTE CAPTION_EDITOR:VTTCueMetadata {"id":"<uuid>","rating":<number>,"timestamp":"..."}`
  - History: `NOTE CAPTION_EDITOR:TranscriptHistory {"entries":[...]}`
- The sentinel allows the parser to distinguish app-specific metadata from regular VTT NOTE comments

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
npm run build
npm run build:electron

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
npm run build && npm run build:electron && npx playwright test tests/electron/
```

**Linux/Docker:**
```bash
npm run build && npm run build:electron && start-xvfb.sh && DISPLAY=:99 npx playwright test tests/electron/
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
# Make sure both build steps completed
npm run build
npm run build:electron

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

These tests use real VTT and audio files from `tests/fixtures/`:
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
npm run build && npm run build:electron
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
npm run build && npm run build:electron
start-xvfb.sh
DISPLAY=:99 npx playwright test tests/electron/
```

**Expected Results:**
- Unit tests: All passing (109/109) ✅
- Python tests: All passing (2/2) ✅
- Browser E2E: All passing (32/32) ✅
- Electron E2E: All passing (17/17) ✅

**Total: 160/160 tests passing (100%)! 🎉**
