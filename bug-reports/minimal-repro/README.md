# Minimal Reproduction: Electron Headless Datalist Crash

**STATUS: ✓ SUCCESSFULLY REPRODUCES THE CRASH**

This minimal reproduction demonstrates an Electron crash that occurs when using Playwright's `.fill()` method on an `<input>` element with `<datalist>` in headless mode.

## Bug Summary
- **Root cause**: Playwright's `.fill()` method on datalist inputs triggers autocomplete UI rendering
- **Environment**: Electron headless mode (where window is hidden)
- **Result**: Electron process crashes with "Target page, context or browser has been closed"
- **Workaround**: Use JavaScript `input.value =` instead of `.fill()`

## Setup

```bash
npm install
```

## Run Tests

### Test in HEADED mode (with visible window):
```bash
npm run test:headed
```

Expected: All 5 tests pass ✓
- Window is visible
- `.fill()` works on datalist inputs

### Test in HEADLESS mode (without visible window):
```bash
npm run test:headless
```

Expected: 2 tests crash, 3 tests pass
- Window is NOT visible (confirmed by test 1)
- ✓ Test 1: Headless mode verification
- ✓ Test 2: Regular input + `.fill()` works
- ✗ Test 3: Datalist (non-empty) + `.fill()` **CRASHES**
- ✗ Test 4: Datalist (empty) + `.fill()` **CRASHES**
- ✓ Test 5: Datalist + JavaScript `value =` works

## Key Finding

The crash is NOT about empty vs non-empty initial values. **ANY** use of Playwright's `.fill()` on a datalist input crashes Electron in headless mode.

## How Headless Works

In Electron, headless mode must be controlled in the app's `main.js`:

```javascript
const win = new BrowserWindow({
  show: process.env.HEADLESS !== 'true',  // Hide window when HEADLESS=true
  // ... other options
})
```

Playwright's `headless` launch option does NOT control Electron window visibility.

## Test Results

```bash
$ HEADLESS=true npm test

Running 5 tests using 1 worker

HEADLESS env var: true
Window isVisible(): false
✓ Confirmed: Running in HEADLESS mode

  ✓  1 test.spec.js › verify headless mode is active
  ✓  2 test.spec.js › regular input works in headless mode
  ✗  3 test.spec.js › datalist with NON-EMPTY initial value
  ✗  4 test.spec.js › datalist with EMPTY initial value
  ✓  5 test.spec.js › datalist empty -> via JS

  2 failed
  3 passed
```

## Crash Error

```
Error: locator.fill: Target page, context or browser has been closed
```

## Workaround

```javascript
// ✗ This crashes in headless:
await input.fill('Alice')

// ✓ This works:
await window.evaluate(() => {
  const input = document.querySelector('.test-datalist-empty')
  input.value = 'Alice'
  input.dispatchEvent(new Event('input', { bubbles: true }))
})
```

## Report to Upstream

This appears to be a bug in Playwright's Electron support. Consider reporting to:
- https://github.com/microsoft/playwright/issues

## Environment

**Tested and confirmed on:**
- Electron: 40.0.0 (latest as of 2026-01-19)
- Playwright: 1.57.0 (latest as of 2026-01-19)
- Node: 22.20.0
- Platform: macOS

**Bug status**: Still present in latest versions

## References

- [Feature] Headless Electron · Issue #13288 · microsoft/playwright - https://github.com/microsoft/playwright/issues/13288
- [Question] Is it possible to run playwright for Electron in headless mode ? · Issue #2609 · microsoft/playwright/issues/2609
