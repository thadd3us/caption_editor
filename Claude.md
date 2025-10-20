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
