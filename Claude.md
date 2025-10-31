# Claude Development Notes

## Testing Guidelines

### Performance Requirements

Tests should run quickly to maintain development velocity:

- **Unit tests**: Maximum 4 seconds total
- **E2E tests**: Maximum 25 seconds total

### Running Tests

#### Unit Tests
```bash
npm test
```

Current performance: ~1.3s for 95 tests ✅

#### E2E Tests
```bash
npx playwright test
```

Current performance: ~19.5s for 21 tests ✅

#### Run Specific Test File
```bash
# Unit test
npm test src/utils/findIndexOfRowForTime.test.ts

# E2E test
npx playwright test comprehensive-e2e.spec.ts
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
- Ratings stored in NOTE metadata as JSON
- Format: `NOTE {"id":"<uuid>","rating":<number>}`

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

### Quick Start

**First time setup:** Start Xvfb using the provided script:

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

**Then set the DISPLAY variable:**
```bash
export DISPLAY=:99
```

**Verify it's running:**
```bash
ps aux | grep Xvfb | grep -v grep
```

> **Note:** Xvfb needs to be started manually each time the container restarts. The Dockerfile includes the script at `/usr/local/bin/start-xvfb.sh` but does not auto-run it on container startup.

### Running Electron Tests

```bash
# Make sure DISPLAY is set
export DISPLAY=:99

# Run all Electron tests
npm run test:e2e:electron

# Run specific test file
npx playwright test tests/electron/file-association.electron.spec.ts

# Run with verbose output
npx playwright test tests/electron/file-association.electron.spec.ts --reporter=list
```

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
