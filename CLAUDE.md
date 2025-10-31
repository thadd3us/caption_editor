# Claude Development Notes

## Testing Guidelines

### Performance Requirements

Tests should run quickly to maintain development velocity:

- **Unit tests**: Maximum 4 seconds total
- **E2E tests**: Maximum 25 seconds total

### Test Status Overview

**Current Test Suite Status:**
- ✅ TypeScript Unit Tests: 109/109 passing, 93.34% coverage
- ✅ Python Tests: 2/2 passing
- ✅ Browser E2E Tests: 32/32 passing ⭐ **ALL PASSING!**
- ✅ Electron E2E Tests: 17/17 passing ⭐ **ALL PASSING!**

**All tests are now passing!** The test suite is fully functional.

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

Current performance: ~1.7s for 109 tests ✅

With coverage:
```bash
npm test -- --coverage
```

Current coverage: 93.33% ✅

#### TypeScript E2E Tests
```bash
npx playwright test
```

Current performance: ~35s for 41 browser tests (29 passing, 8 Electron tests require Xvfb) ✅

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

# TypeScript E2E test
npx playwright test comprehensive-e2e.spec.ts

# Python test
cd transcribe
uv run pytest tests/test_transcribe.py -v

# With specific test function
uv run pytest tests/test_transcribe.py::test_transcribe_osr_audio -v
```

#### Run All Tests (Full Suite)
```bash
# TypeScript tests
npm test -- --coverage
npx playwright test

# Python tests
cd transcribe && uv run pytest tests/ -v
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

#### E2E Tests (`tests/**/*.spec.ts`)
- Browser-based integration tests
- Test full user workflows
- Use Playwright with Chromium
- Keep tests focused and efficient

### Writing New Tests

When adding tests:

1. **Prefer unit tests** for logic that can be extracted and tested in isolation
2. **Use E2E tests** for user interactions and integration points
3. **Avoid long waits** - use `waitForTimeout()` sparingly and keep under 500ms
4. **Click buttons directly** when UI elements are obscured:
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

## Running Electron Tests with Xvfb

Electron requires a display server to run, even in headless mode. We use Xvfb (X Virtual Framebuffer) to provide a virtual display.

### Prerequisites

**IMPORTANT:** Before running Electron tests, you must build the Electron app:

```bash
npm run build:electron
```

This builds `dist-electron/main.cjs` and `dist-electron/preload.cjs` which are required for Electron tests to launch.

### Quick Start

**Step 1:** Start Xvfb using the provided script:

```bash
# Start Xvfb using the startup script
/usr/local/bin/start-xvfb.sh

# Or manually if you prefer:
Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset > /tmp/xvfb.log 2>&1 &
```

The script will:
- Start Xvfb on display :99
- Log output to `/tmp/xvfb.log`
- Tell you to set `DISPLAY=:99`

**Step 2:** Set the DISPLAY variable:
```bash
export DISPLAY=:99
```

**Step 3:** Verify Xvfb is running:
```bash
ps aux | grep Xvfb | grep -v grep
```

> **Note:** Xvfb needs to be started manually each time the container restarts. The Dockerfile includes the script at `/usr/local/bin/start-xvfb.sh` but does not auto-run it on container startup.

### Running Electron Tests

```bash
# Make sure DISPLAY is set and Electron is built
export DISPLAY=:99

# Run all Electron tests
npx playwright test tests/electron/ --reporter=list

# Run specific test file
npx playwright test tests/electron/file-association.electron.spec.ts

# Run with verbose output
npx playwright test tests/electron/file-association.electron.spec.ts --reporter=list
```

### Test Results

**All 17 Electron tests now pass!** Key fixes included:
- Building the main app with `npm run build` before running Electron tests
- Fixed test selectors to use `.open-button` instead of `.upload-button`
- Fixed File menu selector to use `.menu-item` class to avoid ambiguity
- Updated VTT format in tests to use CAPTION_EDITOR sentinel format
- Added state clearing between tests to avoid cross-test contamination

**Browser E2E Tests:** All 32 browser tests pass with proper selectors for menu items.

### Troubleshooting

**Tests fail with "Missing X server or $DISPLAY":**
```bash
# Check if Xvfb is running
ps aux | grep Xvfb

# Check DISPLAY variable
echo $DISPLAY

# Restart Xvfb if needed
pkill Xvfb
/usr/local/bin/start-xvfb.sh
```

**Xvfb logs:**
```bash
# Check Xvfb logs for errors
cat /tmp/xvfb.log
```

### Why Xvfb?

Electron apps use Chromium under the hood, which requires a display server to render the UI. Xvfb provides a virtual display that allows us to run Electron tests in headless environments like Docker containers or CI/CD pipelines without a physical display.

### Electron Test Configuration

Test timeouts are configured in `playwright.electron.config.ts`:
- Global timeout: 30 seconds per test
- Action timeout: 10 seconds per action

These are reasonable for Electron tests which typically run in 5-10 seconds.

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

To run the complete test suite from a fresh state:

```bash
# 1. Install dependencies (if not already done)
npm install
cd transcribe && uv sync && cd ..

# 2. Run TypeScript unit tests with coverage
npm test -- --coverage

# 3. Run Python tests
cd transcribe && uv run pytest tests/ -v && cd ..

# 4. Run browser E2E tests (skip Electron)
npx playwright test --grep-invert "electron"

# 5. Optional: Run Electron tests (requires build + Xvfb)
npm run build:electron
/usr/local/bin/start-xvfb.sh
export DISPLAY=:99
npx playwright test tests/electron/ --reporter=list
```

**Expected Results:**
- Unit tests: All passing (109/109) ✅
- Python tests: All passing (2/2) ✅
- Browser E2E: All passing (32/32) ✅
- Electron E2E: All passing (17/17) ✅

**Total: 160/160 tests passing!**
