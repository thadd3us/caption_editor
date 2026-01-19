# Playwright `.fill()` Crashes Electron with Hidden Window + Datalist

**STATUS: ✓ REPRODUCES**

Minimal reproduction demonstrating that Playwright's `.fill()` method crashes Electron when:
1. BrowserWindow is created with `show: false` (hidden window)
2. Input element has a `<datalist>` for autocomplete
3. `.fill()` is called on that input

## Quick Reproduction

```bash
npm install
npm run test:hidden   # Crashes - 2 tests fail
npm run test:visible  # Works - all 5 tests pass
```

## Bug Description

**Root Cause**: Playwright's `.fill()` method on datalist inputs triggers browser autocomplete UI rendering. When the Electron window is hidden (`show: false`), this UI rendering fails and crashes the Electron process.

**Error**: `locator.fill: Target page, context or browser has been closed`

**Workaround**: Use JavaScript `input.value = 'text'` instead of `.fill()`

## Test Results

### With Visible Window (`show: true`)
```bash
$ npm run test:visible

✓ Window visibility verification
✓ Regular input + .fill()
✓ Datalist (non-empty) + .fill()  ← Works fine
✓ Datalist (empty) + .fill()      ← Works fine
✓ Datalist + JavaScript setValue

5 passed
```

### With Hidden Window (`show: false`)
```bash
$ npm run test:hidden

✓ Window visibility verification
✓ Regular input + .fill()
✗ Datalist (non-empty) + .fill()  ← CRASHES
✗ Datalist (empty) + .fill()      ← CRASHES
✓ Datalist + JavaScript setValue  ← Works fine

2 failed, 3 passed
```

## How Window Visibility Works in Electron

In Electron, you control window visibility via the `show` option in `BrowserWindow`:

```javascript
const win = new BrowserWindow({
  show: false,  // Window exists but is not visible
  // ... other options
})
```

**Note**: This is about Electron's `show` window option, **not** Playwright's `headless` browser option (which doesn't apply to Electron). The window process runs normally but without displaying UI.

## Reproduction Steps

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Run with visible window** (all tests pass)
   ```bash
   npm run test:visible
   ```
   - Window appears on screen
   - All 5 tests pass ✓
   - `.fill()` works on datalist inputs

3. **Run with hidden window** (crashes)
   ```bash
   npm run test:hidden
   ```
   - No window appears (but process runs)
   - Tests 3 & 4 crash when calling `.fill()` on datalist input
   - Test 5 passes (uses JavaScript instead of `.fill()`)

## Files

- **`main.js`** - Electron app that reads `HEADLESS` env var to control `show` option
- **`index.html`** - Page with datalist inputs and regular input
- **`test.spec.js`** - Playwright tests demonstrating crash
- **`package.json`** - Dependencies and test scripts

## Workaround

Don't use `.fill()` on datalist inputs when window is hidden:

```javascript
// ✗ This crashes when window is hidden:
await input.fill('Alice')

// ✓ This works:
await page.evaluate(() => {
  const input = document.querySelector('.my-input')
  input.value = 'Alice'
  input.dispatchEvent(new Event('input', { bubbles: true }))
})
```

## Environment

**Tested and confirmed on:**
- **Electron**: 40.0.0 (latest as of 2026-01-19)
- **Playwright**: 1.57.0 (latest as of 2026-01-19)
- **Node**: 20.x / 22.x
- **Platform**: macOS (likely affects all platforms)

## Key Finding

The crash is **NOT** about:
- ❌ Empty vs non-empty initial values
- ❌ AG Grid or Vue (this is a vanilla HTML reproduction)
- ❌ Specific datalist content

The crash **IS** about:
- ✅ Playwright's `.fill()` method
- ✅ Datalist inputs specifically
- ✅ BrowserWindow with `show: false`

## Additional Notes

- Regular inputs (without datalist) work fine with `.fill()` when window is hidden
- Datalist inputs work fine with `.fill()` when window is visible
- Setting value via JavaScript works in all cases
- The first test explicitly verifies window visibility to ensure reproduction is valid

## Confirmed: This is a Playwright Bug

We tested without Playwright using plain Electron + JavaScript:

```bash
npm run test:electron-only-hidden   # ✓ ALL TESTS PASS
npm run test:electron-only-visible  # ✓ ALL TESTS PASS
```

Plain JavaScript manipulation of datalist inputs works **perfectly** in Electron with `show: false`. The crash only occurs when using Playwright's `.fill()` method.

**Conclusion**: This is a bug in Playwright's `.fill()` implementation, not an Electron bug.

## Report Upstream

This should be reported to Playwright:
- https://github.com/microsoft/playwright/issues

Related issues (about Electron window visibility):
- [Feature] Headless Electron · Issue #13288: https://github.com/microsoft/playwright/issues/13288
- [Question] Is it possible to run playwright for Electron in headless mode? · Issue #2609: https://github.com/microsoft/playwright/issues/2609

**Note**: These issues use the term "headless" but they're really about running Electron with `show: false` (hidden window), not browser headless mode.
