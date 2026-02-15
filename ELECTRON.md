# Electron Desktop Application

This VTT Editor is now packaged as an Electron desktop application with proper file system permissions, especially optimized for macOS security.

## Features

- **Secure File Access**: Uses macOS security-scoped bookmarks to access only the files you explicitly open
- **No Overly Broad Permissions**: Unlike many Electron apps, this doesn't request full filesystem access
- **Drag & Drop Support**: Drag VTT and media files directly into the app
- **Cross-Platform**: Works on macOS, Windows, and Linux
- **Native File Dialogs**: Uses native OS file pickers for better UX

## File Permissions

### macOS
The app uses these minimal entitlements:
- `com.apple.security.files.user-selected.read-write` - Read/write only files you explicitly select
- `com.apple.security.files.downloads.read-write` - Access to your Downloads folder
- No broad filesystem access required!

### Windows/Linux
Standard file access through native dialogs. No special permissions needed.

## Development

### Once

```
npm install
```

### Running in Development Mode

1. Start the Vite dev server:
   ```bash
   npm run dev
   ```

2. In another terminal, run Electron:
   ```bash
   npm run dev:electron
   ```

### Building the App

Build both the renderer and Electron main process:
```bash
npm run build:all
```

This creates:
- `dist/` - The Vue.js web app (renderer)
- `dist-electron/` - The Electron main process and preload script

## Packaging

### Package for Your Platform

```bash
# macOS
npm run package:mac

# Windows
npm run package:win

# Linux
npm run package:linux

# All platforms
npm run package
```

The packaged apps will be in the `release/` directory.

### macOS Specific

The macOS build includes:
- DMG installer
- Zip archive
- Code signing ready (add your signing certificate)
- Hardened runtime enabled
- Notarization ready

## Testing

### Run Electron Tests

```bash
npm run test:e2e:electron
```

This runs Playwright tests specifically for the Electron app, including:
- Application launch and window creation
- Electron API availability
- File operations (open, read, save)
- File drop handling
- Screenshot capture to verify UI renders correctly

Screenshots are saved to `tests/electron/screenshots/` for visual verification.

### Manual Testing

1. Build the app: `npm run build:all`
2. Run Electron: `npm run dev:electron`
3. Test these features:
   - Click "Open Files" button - should show native file picker
   - Drag and drop VTT/media files
   - Export VTT - should show native save dialog
   - Files should be accessible without permission errors

## Architecture

### Main Process (`electron/main.ts`)
- Manages the application lifecycle
- Creates windows
- Handles file system operations securely
- Exposes safe IPC channels to renderer

### Preload Script (`electron/preload.ts`)
- Bridges main and renderer processes
- Exposes `window.electronAPI` to renderer
- Context-isolated for security

### Renderer Process (`src/`)
- Vue.js application
- Detects Electron environment
- Uses Electron APIs when available
- Falls back to browser APIs otherwise

## File Operations

### Reading Files
```typescript
// Renderer side
const result = await window.electronAPI.readFile(filePath)
if (result.success) {
  console.log(result.content)
}
```

### Saving Files
```typescript
// Renderer side
const result = await window.electronAPI.saveFile({
  content: captionsJsonContent,
  suggestedName: 'captions.captions_json'
})
```

### File Drops
The app automatically handles file drops from Finder/Explorer:
```typescript
window.addEventListener('electron-files-dropped', (event) => {
  const { filePaths } = event.detail
  // Process files
})
```

## Security

### Content Security Policy
The app uses:
- Context isolation enabled
- Node integration disabled
- Sandbox enabled
- Preload script for controlled IPC

### File Access
- All file operations go through the main process
- No direct filesystem access from renderer
- User must explicitly select files via dialogs or drag-drop
- Security-scoped bookmarks on macOS (future enhancement)


## Troubleshooting

### "File not found" errors on macOS
- Make sure you're using the file dialogs or drag-drop
- Check that the file isn't in a protected location like System folders

### "Permission denied" errors
- The app should prompt for file access automatically
- If issues persist, check System Preferences > Security & Privacy > Files and Folders

### Blank white screen / App doesn't load

This is usually caused by incorrect asset paths. The fix has been applied in `vite.config.ts` by setting `base: './'` to use relative paths instead of absolute paths.

If you still see a blank screen:
```bash
# Clean and rebuild
rm -rf dist dist-electron
npm run build:all
npm run dev:electron
```


Note: On Linux, Electron requires GTK libraries. If you see `libgtk-3.so.0` errors, install them:
```bash
# Ubuntu/Debian
sudo apt-get install libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils libatspi2.0-0 libdrm2 libgbm1 libasound2
```

### App won't package
- Ensure you have the latest electron-builder: `npm install -D electron-builder@latest`
- Check that all dependencies are installed: `npm install`
- For macOS, ensure you have Xcode command line tools: `xcode-select --install`

## Future Enhancements

- [ ] Auto-update support with electron-updater
- [ ] Better security-scoped bookmark persistence
- [ ] Menu bar integration
- [ ] Keyboard shortcuts
- [ ] Recent files list
- [ ] Watch mode for auto-reload of files
