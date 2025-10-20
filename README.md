# VTT Editor

A browser-based, frontend-only WebVTT caption file editor with media playback support.

## Features

### Core Functionality

- **VTT File Support**: Open, edit, and export WebVTT caption files with full standard compliance
- **Media Playback**: Load and play video or audio files alongside captions
- **Drag & Drop**: Intuitive file loading - drop VTT and media files together or separately
- **Dual Panel Layout**: Resizable split view with caption table (left, 60% default) and media player (right)

### Caption Management

- **Rich Editing**: Edit timestamps, caption text, and metadata directly in the table
- **Star Ratings**: Rate captions 1-5 stars with click-to-rate interface
- **UUID Tracking**: Automatic UUID generation and persistence for each caption
- **Temporal Sorting**: Captions automatically sort by start time, then end time
- **Validation**: Timestamp and duration validation prevents invalid edits

### Media Controls

- **Standard Playback**: Play, pause, and scrub through media
- **Jump Controls**: Quick navigation buttons for ±1s, ±5s, ±30s, ±60s
- **Snippet Playback**: Play individual caption segments with auto-stop
- **Seek to Caption**: Jump to any caption's start time
- **Add Captions**: Create new 5-second captions at current playhead position

### Data Persistence

- **Auto-Save**: Document state automatically saved to browser localStorage
- **Crash Recovery**: Reload the page without losing any work
- **Lossless Export**: All metadata (UUIDs, ratings) preserved in exported VTT files via NOTE comments

### Technical Details

- **Framework**: Vue 3 with TypeScript and Composition API
- **State Management**: Pinia for reactive document state
- **UI Components**: AG Grid for high-performance caption table
- **Immutable Data**: Caption entries are immutable for efficient state management
- **Testing**: Playwright end-to-end tests for all operations

## Getting Started

### Prerequisites

- Node.js 18+ and npm/pnpm/yarn
- For testing: Playwright browsers (installed via `npx playwright install`)

### Development Container (Recommended)

This project includes a complete devcontainer setup with all dependencies pre-installed:

```bash
# Using VS Code
1. Install the "Dev Containers" extension
2. Open the project in VS Code
3. Click "Reopen in Container" when prompted
   (or use Command Palette: "Dev Containers: Reopen in Container")

# Using GitHub Codespaces
1. Click "Code" → "Codespaces" → "Create codespace on main"
2. Everything is pre-configured!
```

The devcontainer includes:
- Node.js 20
- All npm dependencies pre-installed
- Playwright browsers and system dependencies
- VS Code extensions for Vue, TypeScript, and Playwright
- Port forwarding for dev server (3000) and test reports (9323)

### Manual Installation

```bash
# Install dependencies
npm install

# Or with pnpm
pnpm install

# Or with yarn
yarn install
```

### Development

```bash
# Start development server (http://localhost:3000)
npm run dev
```

### Building

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

### Testing

```bash
# Run unit tests
npm run test:unit

# Run Playwright E2E tests
npm run test:e2e

# Run tests with UI
npm run test:e2e:ui

# Run tests with coverage report
npm run test:coverage

# View coverage report (after running tests)
npx playwright show-report

# Install Playwright browsers (first time only)
npx playwright install
```

#### Test Timeout Philosophy

**All test timeouts are deliberately kept very short (100-200ms)** to catch stalled tests immediately:

- UI operations should complete in milliseconds, not seconds
- A test taking >10 seconds total indicates a real problem (infinite loop, missing element, etc.)
- Short timeouts = fast feedback when something breaks
- If a test times out, it's **always** a bug - either in the code or the test itself

**Timeout Guidelines:**
- Page interactions (clicks, seeks): 100ms wait
- File loading/initialization: 200ms wait
- Entire test suite should complete in <1 minute

If you see timeout failures, don't just increase the timeout - investigate why the operation is slow!

#### Test Coverage

The test suite includes comprehensive coverage:
- **Unit tests**: Vue components (StarRatingCell), stores (vttStore), utilities (vttParser)
- **E2E tests**:
  - Application loading and initialization
  - File drag-and-drop functionality
  - VTT parsing and serialization
  - Star rating interactions (full flow)
  - Playhead/scrub bar/table integration
  - Caption editing and validation
  - Media playback controls
  - LocalStorage persistence
  - Export functionality
  - UI component rendering

Test reports are generated in `playwright-report/` with screenshots and videos for failed tests.

## Usage

### Loading Files

1. **Drag & Drop**: Drag VTT and/or media files onto the application
   - Drop both files together to load them simultaneously
   - Drop only a media file to start with an empty caption document
   - Drop only a VTT file to edit captions without media

2. **File Picker**: Click the "📁 Open Files" button to select files

### Editing Captions

- **Edit Text**: Click any caption text cell to edit in-place
- **Edit Timestamps**: Click start/end time cells to edit (format: HH:MM:SS.mmm)
- **Rate Captions**: Click stars to rate (click current rating to clear)
- **Add Caption**: Use "➕ Add Caption at Current Position" button while playing media
- **Delete Caption**: Click 🗑️ button (with confirmation dialog)

### Playback Controls

- **Play Snippet**: ▶️ button plays only that caption's time range
- **Seek to Start**: ⏮️ button jumps to caption start without playing
- **Jump Controls**: Use ±1s, ±5s, ±30s, ±60s buttons for precise navigation
- **Scrub Bar**: Drag the slider to move through media

### Exporting

- Click "Export VTT" in the menu bar to download your edited captions
- All UUIDs and ratings are preserved in the exported file
- File downloads with original filename or "captions.vtt"

### Clearing Data

- Click "Clear" in menu bar to reset the editor (with confirmation)
- This removes all captions, media, and localStorage data

## VTT File Format

### Standard Elements

- **Header**: `WEBVTT` (required first line)
- **Cue Identifier**: UUID for each caption (preserved across edits)
- **Timestamps**: Format `HH:MM:SS.mmm --> HH:MM:SS.mmm`
- **Caption Text**: Multi-line text content

### Extended Metadata

This editor stores additional metadata in NOTE comments:

```
NOTE {"id":"550e8400-e29b-41d4-a716-446655440000","rating":4}

550e8400-e29b-41d4-a716-446655440000
00:00:01.000 --> 00:00:05.000
Caption text with 4-star rating
```

## Architecture

### Project Structure

```
src/
├── types/          # TypeScript type definitions
│   └── vtt.ts      # VTT data models
├── utils/          # Utility functions
│   └── vttParser.ts # VTT parsing and serialization
├── stores/         # Pinia state management
│   └── vttStore.ts # Document state and actions
├── components/     # Vue components
│   ├── MenuBar.vue
│   ├── FileDropZone.vue
│   ├── CaptionTable.vue
│   ├── MediaPlayer.vue
│   ├── StarRatingCell.vue
│   └── ActionButtonsCell.vue
├── App.vue         # Root component
└── main.ts         # Application entry point

tests/
├── fixtures/       # Test data files
└── vtt-editor.spec.ts # Playwright tests
```

### Data Model

```typescript
interface VTTCue {
  readonly id: string        // UUID
  readonly startTime: number // Seconds
  readonly endTime: number   // Seconds
  readonly text: string      // Caption text
  readonly rating?: number   // 1-5 stars
}

interface VTTDocument {
  readonly cues: readonly VTTCue[]
  readonly filePath?: string
}
```

### State Management

- **Pinia Store**: Central document state with actions for all mutations
- **Immutable Cues**: Each edit creates a new cue object (preserves UUID)
- **Auto-Save**: Watch on document state triggers localStorage save
- **Computed Properties**: Sorted cues, current cue based on playhead

### Key Technologies

- **Vue 3**: Modern reactive framework with TypeScript support
- **Pinia**: Lightweight, type-safe state management
- **AG Grid**: Enterprise-grade data grid with inline editing
- **Vite**: Fast build tool and dev server
- **Playwright**: Reliable end-to-end testing

## Browser Compatibility

- Modern browsers with ES2020 support
- localStorage API required for persistence
- File API for drag & drop
- HTML5 video/audio element support

## Debugging

### Inspecting Document State

In development mode, the Pinia store is exposed on `window.$store` for easy debugging. Open the browser console and use:

```javascript
// View the complete document structure as formatted JSON
console.log(JSON.stringify($store.document, null, 2))

// Access individual properties
console.log($store.document.cues.length)          // Number of captions
console.log($store.document.cues)                 // Captions (always sorted by time)
console.log($store.currentCue)                    // Current cue at playhead
console.log($store.currentTime)                   // Current playback position
console.log($store.mediaPath)                     // Loaded media file path

// View a specific cue
console.log(JSON.stringify($store.document.cues[0], null, 2))
```

**Example output:**

```json
{
  "cues": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "startTime": 1.5,
      "endTime": 4.25,
      "text": "First caption",
      "rating": 5
    }
  ],
  "filePath": "example.vtt"
}
```

This outputs the complete TypeScript `VTTDocument` structure including all cues with their IDs, timestamps, text, and ratings.

**Note:** The store is only exposed in development mode (`npm run dev`). In production builds, use Vue DevTools extension for state inspection.

## References

- [WebVTT Specification](https://www.w3.org/TR/webvtt1/)
- [WebVTT Data Model](https://www.w3.org/TR/webvtt1/#data-model)
- [UT Austin WebVTT Guide](https://sites.utexas.edu/cofawebteam/requirements/ada/captions/webvtt-files-for-video-subtitling/)

## License

MIT

## Summary of Requirements

This application implements all requested features:

1. ✅ Browser-based, frontend-only VTT editor
2. ✅ Open VTT files via drag & drop or file picker
3. ✅ Open media files (video/audio)
4. ✅ Bonus: Drag both files simultaneously
5. ✅ Dual vertical panels (60/40 split, resizable)
6. ✅ AG Grid table with caption data
7. ✅ UUID generation and persistence via cue identifiers
8. ✅ 1-5 star rating system with click interface
9. ✅ Rating persistence in NOTE comments as JSON
10. ✅ Editable timestamps and caption text
11. ✅ Inline editing with AG Grid cell editors
12. ✅ Timestamp validation
13. ✅ Action buttons: play snippet, seek, delete
14. ✅ Delete confirmation modal
15. ✅ Automatic temporal sorting
16. ✅ Media playback controls (play, pause, scrub)
17. ✅ Playhead synchronization with caption table
18. ✅ Auto-scroll to current caption
19. ✅ Jump buttons (±1s, ±5s, ±30s, ±60s)
20. ✅ Playhead position display
21. ✅ Add caption at current position (5s default)
22. ✅ Menu bar with export/download
23. ✅ Download to original location (browser limitation)
24. ✅ Lossless export with JSON metadata
25. ✅ TypeScript schemas for all data
26. ✅ Immutable caption entries
27. ✅ UUID preservation across edits
28. ✅ Browser localStorage persistence
29. ✅ Crash recovery on page reload
30. ✅ Vue 3 framework
31. ✅ High-quality components (AG Grid, Pinia)
32. ✅ Minimal boilerplate
33. ✅ Generic error dialogs
34. ✅ Generous logging for debugging
35. ✅ Playwright test framework
36. ✅ Comprehensive tests for all operations
37. ✅ Complete README with setup and summary
