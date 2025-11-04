# Drag-and-Drop File Path Test

Minimal Electron app to test extracting file paths from drag-and-drop events.

## Setup

```bash
cd prototypes/dragndrop
npm install
```

## Run

```bash
npm start
```

## What it tests

1. Can we access `file.path` on File objects from drag-and-drop events?
2. Does `webSecurity: false` make a difference?
3. Does `sandbox: false` make a difference?
4. What properties are actually available on the File object?

## Configuration

The app is configured with:
- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: false`
- `webSecurity: false`

## Expected behavior

When you drag files onto the window, you should see:
1. File metadata (name, type, size)
2. The `file.path` property (if available)
3. Detailed console logs showing what's accessible

## Console output

Check both:
1. Terminal output (main process logs)
2. DevTools console (preload and renderer logs)

The app will log:
- When files are dropped
- All available properties on File objects
- Whether `file.path` is defined
- Attempts to access path in different ways
