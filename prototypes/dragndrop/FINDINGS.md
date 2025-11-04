# Drag-and-Drop File Path Findings

## Test Date
November 4, 2025

## Environment
- Electron: v39.0.0
- Platform: Linux (Docker container)
- Test Framework: Playwright

## Configuration Tested
```javascript
{
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: false,
  webSecurity: false
}
```

## Test Results

### ❌ `file.path` is NOT AVAILABLE

Even with `sandbox: false` and `webSecurity: false`, the `path` property does not exist on File objects from drag-and-drop events.

### File Object Properties (Available)

**Depth 0 (own properties):**
- None

**Depth 1 (File constructor):**
- ✓ `name`
- ✓ `lastModified`
- ✓ `lastModifiedDate`
- ✓ `webkitRelativePath`
- ✓ `constructor`

**Depth 2 (Blob prototype):**
- ✓ `size`
- ✓ `type`
- ✓ `arrayBuffer`
- ✓ `slice`
- ✓ `stream`
- ✓ `text`
- ✓ `constructor`

**NOT AVAILABLE:**
- ✗ `path`

## Why file.path Doesn't Work

The `file.path` property was available in older Electron versions but has been removed for security reasons. Modern Electron (v20+) no longer exposes file system paths from drag-and-drop events to the renderer process, regardless of security settings.

## Recommended Solutions

### Option 1: Use File Picker Dialog (Recommended)
```javascript
// Main process
const { dialog } = require('electron')
const result = await dialog.showOpenDialog({
  properties: ['openFile']
})
// result.filePaths contains the full paths
```

**Pros:**
- Reliable path access
- User explicitly grants permission
- Works on all platforms

**Cons:**
- Requires user to click "Open" button
- No drag-and-drop convenience

### Option 2: Read File Content Only (Partial Solution)
```javascript
// Renderer can read file content without paths
const file = event.dataTransfer.files[0]
const content = await file.text()
// But cannot save back to original location!
```

**Pros:**
- Works with drag-and-drop
- No security restrictions

**Cons:**
- ❌ Cannot get file path
- ❌ Cannot save back to original file
- ❌ Lose track of where file came from

### Option 3: Complex Main Process Interception (Not Recommended)
Some apps try to intercept drops at the OS level in the main process, but this is:
- Very complex to implement
- Platform-specific
- Unreliable
- Not officially supported

## Conclusion for VTT Editor

The VTT Caption Editor needs file paths because:
1. Users want to edit and save back to the same file
2. Media files need to be referenced by path in VTT metadata

**Recommended approach:**
- **Remove drag-and-drop for file opening** (it can't work properly)
- **Keep the "Open Files" button** which uses dialog.showOpenDialog
- **Allow drag-and-drop only for loading content** (read-only, no save)
- **OR:** Accept drag-and-drop but immediately show "Save As" dialog to get a path

The current approach of trying to get `file.path` from drops will never work in modern Electron.
