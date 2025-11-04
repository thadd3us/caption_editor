# Drag-and-Drop Implementation with webUtils.getPathForFile()

## Overview

The VTT Caption Editor now supports drag-and-drop of VTT files with proper file path capture, allowing files to be saved back to their original locations.

## Implementation Details

### Key Components

1. **Preload Script** (`electron/preload.ts`):
   - Imports `webUtils` from Electron
   - Exposes `getPathForFile()` API to renderer process
   - Handles drag-and-drop events using `webUtils.getPathForFile()` to extract file paths

2. **Main Process** (`electron/main.ts`):
   - Receives file paths via IPC from preload
   - Forwards paths to renderer for processing
   - Handles file read/write operations

3. **Renderer** (`src/App.vue`):
   - Listens for `onFileDropped` events
   - Loads VTT content and stores file path
   - Can save back to original location using stored path

### How It Works

#### Step 1: User Drops File

When a user drags a VTT file into the app window:

```typescript
// preload.ts - Drop event handler
document.addEventListener('drop', async (e) => {
  const files = e.dataTransfer?.files
  const filePaths: string[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    // Use webUtils.getPathForFile() - only way to get paths in modern Electron
    const filePath = webUtils.getPathForFile(file)
    filePaths.push(filePath)
  }

  // Send paths to main process
  ipcRenderer.send('files-dropped-in-preload', filePaths)
})
```

#### Step 2: Main Process Forwards Paths

```typescript
// main.ts - IPC handler
ipcMain.on('files-dropped-in-preload', (_event, filePaths: string[]) => {
  mainWindow.webContents.send('file-dropped-from-main', filePaths)
})
```

#### Step 3: Renderer Processes Files

```typescript
// App.vue - File drop handler
electronAPI.onFileDropped(async (filePaths: string[]) => {
  const results = await electronAPI.processDroppedFiles(filePaths)

  for (const result of results) {
    if (result.type === 'vtt') {
      // Load VTT and store the file path
      store.loadFromFile(result.content, result.filePath)
    }
  }
})
```

#### Step 4: Save Back to Original Location

```typescript
// When user clicks Save
if (store.document.filePath) {
  await electronAPI.saveExistingFile({
    filePath: store.document.filePath,  // Original path from drag-and-drop
    content: serializeVTT(store.document)
  })
}
```

## Why webUtils.getPathForFile()?

In modern Electron (v20+), the `file.path` property was removed from File objects for security reasons. The only way to get file paths from drag-and-drop events is to use `webUtils.getPathForFile()`.

### Old Method (No Longer Works)
```typescript
// ✗ This doesn't work in Electron v20+
const path = file.path  // undefined
```

### New Method (Required)
```typescript
// ✓ This is the only way in modern Electron
import { webUtils } from 'electron'
const path = webUtils.getPathForFile(file)  // Returns actual path
```

## Security Considerations

- **Context Isolation**: Enabled (`contextIsolation: true`)
- **Node Integration**: Disabled (`nodeIntegration: false`)
- **Sandbox**: Disabled to allow `webUtils.getPathForFile()` access (`sandbox: false`)
- **Web Security**: Disabled to allow file path access (`webSecurity: false`)

While `sandbox: false` and `webSecurity: false` reduce some security protections, they are necessary for the drag-and-drop functionality. The `contextBridge` API ensures that only specific, safe operations are exposed to the renderer.

## Testing

### Manual Testing

1. **Build the app:**
   ```bash
   npm run build && npm run build:electron
   npm start
   ```

2. **Test drag-and-drop:**
   - Drag a VTT file from your file system into the app window
   - Verify the file loads correctly
   - Make an edit to the caption
   - Click "Save" (not "Save As")
   - Check that the file was saved to the original location

3. **Verify path capture:**
   - Open DevTools (View > Toggle Developer Tools)
   - Check console logs for:
     ```
     [preload] ✓ Got path using webUtils.getPathForFile(): /path/to/file.vtt
     ```

### Automated Testing

The drag-and-drop functionality is difficult to test with Playwright because `webUtils.getPathForFile()` only works with genuine File objects from real drag-and-drop events, not synthetic File objects created in tests.

The test in `tests/electron/drag-drop-webutils.electron.spec.ts` verifies that the API is exposed correctly, but full end-to-end testing requires manual verification.

## Troubleshooting

### File path returns empty string

**Symptom:** `webUtils.getPathForFile()` returns `""` instead of the actual path.

**Causes:**
1. File object is synthetic (created from blob/fetch) instead of from actual drag-and-drop
2. webUtils not imported in preload script
3. Context isolation preventing access to webUtils

**Solution:** Ensure webUtils is properly imported and the File object comes from a genuine drag-and-drop event.

### "Cannot find module 'electron/webUtils'"

**Symptom:** TypeScript or runtime error about missing webUtils module.

**Solution:** Import from main electron module:
```typescript
import { webUtils } from 'electron'  // ✓ Correct
```

### File not saving to original location

**Symptom:** Save button prompts for location instead of saving directly.

**Cause:** `store.document.filePath` is not set or is empty.

**Solution:** Verify that file path is captured during drag-and-drop and stored in the document metadata.

## References

- [Electron webUtils API](https://www.electronjs.org/docs/latest/api/web-utils)
- [Electron Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [Drag-and-drop Prototype](prototypes/dragndrop2/)
