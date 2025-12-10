# Caption Editor

* A WebVTT caption file editor with media playback support, including synchronizing selected caption with the current position of the media playback. 
* Browser-based UI, packaged as an electron app. 
* Stores extended metadata about each caption using a special JSON structure stuffed into the VTT comments.
* Carefully preserves version history of edited captions.

### Quick Start (Desktop)

#### Development Mode
```bash
# Install dependencies
npm install

# Build the Electron app (must be done first)
npm run build:all

# Run in development mode (with hot reload)
npm run dev:electron

# Or run the built app directly
npm start
```

#### Production / Packaged Mode
```bash
# Build everything
npm run build:all

# Package for your platform (creates distributable app)
npm run package:mac     # macOS (.app bundle)
npm run package:win     # Windows (.exe installer)
npm run package:linux   # Linux (AppImage)

# The packaged app will be in the dist/ directory
# Note: Python environment bundling is not yet implemented
```

**Note on Python ASR Integration:**
- In **development mode**, the app uses `uv run python` to execute transcription scripts from `transcribe/`
- In **production mode** (packaged app), Python environment bundling is planned but not yet implemented
- The app will validate that required Python scripts exist before attempting to run ASR

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
- **Snippet Playback**: Play individual caption segments with auto-stop
- **Seek to Caption**: Jump to any caption's start time

### Data Persistence

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


### Testing

This project has comprehensive test coverage including unit tests, end-to-end tests, and build verification.

#### Quick Test Commands

```bash
# Run ALL tests (unit + e2e + build verification) - recommended for CI/pre-commit
npm run test:all

# Run unit tests only (Vitest)
npm run test:unit

# Run E2E tests only (Playwright)
npm run test:e2e

# Run TypeScript build verification only
npm run test:build

# Interactive test UIs
npm run test:unit:ui      # Vitest UI
npm run test:e2e:ui       # Playwright UI

# Coverage reports
npm run test:coverage     # Generate combined coverage report
npx playwright show-report # View Playwright HTML report

# First-time setup
npx playwright install    # Install Playwright browsers
```

#### Platform-Specific Testing (Linux/Docker)

On Linux containers without a display server (like the devcontainer), you need Xvfb for Electron tests:

```bash
# Start Xvfb (only needed once per container session)
start-xvfb.sh

# Run Electron tests with DISPLAY set
# Note: DISPLAY=:99 is set by default in the devcontainer
npm run test:e2e

# Or manually with DISPLAY:
DISPLAY=:99 npx playwright test tests/electron/
```

**Troubleshooting Xvfb:**
- If tests fail with "Missing X server", run `start-xvfb.sh`
- Check if running: `ps aux | grep "[X]vfb"`
- For more debugging tips, see `CLAUDE.md` → "Why Xvfb Keeps Dying"

**macOS/Windows:**
- Xvfb is not needed - tests work natively
- Just run `npm run test:e2e` directly

**Recommended workflow:**
- During development: `npm run test:unit` (fast feedback)
- Before committing: `npm run test:all` (complete verification)
- For debugging: Use the UI modes (`test:unit:ui` or `test:e2e:ui`)


## VTT File Format

### Standard Elements

- **Header**: `WEBVTT` (required first line)
- **Cue Identifier**: UUID for each caption (preserved across edits)
- **Timestamps**: Format `HH:MM:SS.mmm --> HH:MM:SS.mmm`
- **Caption Text**: Multi-line text content

### Extended Metadata

This editor stores additional metadata in NOTE comments:

#### Document Metadata (Top of File)
The first NOTE comment contains document-level metadata including a UUID for the transcript and the relative path to the associated media file:

```
WEBVTT

-- TODO: This has gotten out of date, please update!
NOTE {"id":"2ea43707-088b-c4fe-c7ff-b59f4a1232a0","mediaFilePath":"video.mp4"}
```

**Note:** When using the Python transcription tool (`transcribe/transcribe.py`), the media file is automatically copied alongside the VTT output to ensure they stay together and the relative path remains valid across different systems.

#### Cue Metadata
Each caption can have metadata stored in a NOTE comment immediately before it:

```
-- TODO: This has gotten out of date, please update!
NOTE {"id":"550e8400-e29b-41d4-a716-446655440000","rating":4,"timestamp":"2025-10-29T..."}

550e8400-e29b-41d4-a716-446655440000
00:00:01.000 --> 00:00:05.000
Caption text with 4-star rating
```

#### Transcript History (End of File)
Changes to captions are tracked in a history NOTE at the end of the file, preserving the original state of modified or deleted segments.

### Key Technologies

- **Vue 3**: Modern reactive framework with TypeScript support
- **Pinia**: Lightweight, type-safe state management
- **AG Grid**: Enterprise-grade data grid with inline editing
- **Vite**: Fast build tool and dev server
- **Playwright**: Reliable end-to-end testing

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
