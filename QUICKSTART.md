# Quick Start Guide

## Setup (First Time Only)

```bash
# Install Node.js dependencies
npm install

# Install Playwright browsers for testing
npx playwright install chromium
```

## Running the Application

```bash
# Start development server
npm run dev
```

Then open http://localhost:3000 in your browser.

## Using the Editor

1. **Load Files**:
   - Drag a `.vtt` file and/or video/audio file onto the page
   - Or click the "📁 Open Files" button

2. **Edit Captions**:
   - Click any cell in the table to edit
   - Click stars to add ratings (1-5)
   - Use action buttons (▶️ play, ⏮️ seek, 🗑️ delete)

3. **Media Controls**:
   - Play/pause with the control button
   - Use jump buttons for quick navigation (±1s, ±5s, ±30s, ±60s)
   - Click "➕ Add Caption" to create new captions

4. **Save Your Work**:
   - Click "Export VTT" to download
   - Your work is auto-saved to browser storage

## Running Tests

```bash
# Run all tests
npm run test:e2e

# Run with interactive UI
npm run test:e2e:ui
```

## Project Structure

- `src/` - All application source code
  - `components/` - Vue components
  - `stores/` - Pinia state management
  - `types/` - TypeScript definitions
  - `utils/` - Helper functions (VTT parser)
- `tests/` - Playwright E2E tests
- `README.md` - Complete documentation

## Troubleshooting

**Port 3000 already in use?**
- Edit `vite.config.ts` to change the port
- Or kill the process using port 3000

**Playwright tests failing?**
- Make sure browsers are installed: `npx playwright install`
- Check dev server is not already running

**Files not loading?**
- Check browser console for errors
- Verify file formats (.vtt, .mp4, .mp3, etc.)

## Development Tips

- Open browser DevTools to see detailed logging
- All state changes are logged to console
- LocalStorage key: `vtt-editor-document`
- Clear storage: Open DevTools → Application → Clear Storage
