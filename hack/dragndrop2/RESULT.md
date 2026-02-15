# Drag-and-Drop Test v2 Results

## Test Date
November 4, 2025

## Configuration Tested
Based on the example code provided:
```javascript
{
  contextIsolation: true,
  preload: path.join(__dirname, 'preload.js')
  // No nodeIntegration, no sandbox/webSecurity overrides
}
```

## Test Results

### ❌ file.path is STILL NOT AVAILABLE

```
[test] file.path available? false
[test] file.path value: undefined
[test] typeof file.path: undefined
```

File object properties found:
- ✓ name
- ✓ lastModified
- ✓ lastModifiedDate
- ✓ webkitRelativePath
- ✓ size
- ✓ type
- ✗ **path** - NOT PRESENT

## Conclusion

The example code provided will NOT work in modern Electron because:

```javascript
const paths = Array.from(e.dataTransfer.files).map(f => f.path);
// paths will be [undefined, undefined, ...]
```

The `file.path` property does not exist on File objects in Electron v39.0.0, regardless of configuration.

## Why The Example Code Doesn't Work

The example assumes `f.path` is available, but it's not:

```javascript
// renderer.html from example
dropzone.addEventListener('drop', (e) => {
  const paths = Array.from(e.dataTransfer.files).map(f => f.path);
  //                                                         ^^^^
  //                                                   UNDEFINED!
  window.fileDrop.sendPaths(paths);
});
```

This will send `[undefined, undefined, ...]` to the main process, which then tries to:

```javascript
// main.js from example
const first = filePaths[0];  // first = undefined
const content = fs.readFileSync(first, 'utf8');  // ERROR!
```

Result: **File operation fails** because path is undefined.

## When Did This Work?

The `file.path` property existed in older Electron versions (pre-v20) but was removed for security reasons. The example code is outdated.

## What Actually Works

The ONLY way to get file paths in modern Electron is:

### 1. File Picker Dialog (Reliable)
```javascript
const { dialog } = require('electron')
const result = await dialog.showOpenDialog({
  properties: ['openFile']
})
// result.filePaths = ['/actual/path/to/file']
```

### 2. Read Content Only (No Paths)
```javascript
// Can read file CONTENT but not get the PATH
const file = e.dataTransfer.files[0]
const content = await file.text()
// Now you have content but don't know where it came from
```

## Recommendation for VTT Editor

Since the VTT editor needs to:
1. Open files
2. Edit them
3. **Save back to the same location**

**Drag-and-drop cannot work** for this use case. You MUST use:
- File picker dialog (`dialog.showOpenDialog`) to get paths
- Store the path for later saving
- Show "Open Files" button instead of relying on drag-and-drop

Alternatively:
- Allow drag-and-drop for READ-ONLY viewing
- Force "Save As" dialog every time (can't save to original location)
