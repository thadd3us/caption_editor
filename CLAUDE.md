# Claude Development Notes

## Important Reminders

**DO NOT create summary/readme files like CLUSTERING_README.md, IMPLEMENTATION_SUMMARY.md, etc.**
- Just update this CLAUDE.md file with notes
- Users can read the code and tests to understand features

## Development Workflow

### Version Management

**IMPORTANT: When changing Node.js/TypeScript code, bump the Electron app version!**

Update `APP_VERSION` in `electron/constants.ts` (e.g., `1.3.6`). This is the single source of truth.

### Committing Work

**Always commit your work when you reach a good checkpoint:**
- Tests are passing
- Code is in a working state
- A logical unit of work is complete

```bash
npm run test:unit
DISPLAY=:99 npx playwright test tests/electron/
git add -A
git commit -m "Your message" --trailer "Co-authored-by: Sculptor <sculptor@imbue.com>"
```

## Testing

### Quick Start

```bash
# Run all tests
./scripts/run-all-tests.sh

# Run specific suites
npm test                    # Unit tests (watch mode)
npm run test:unit           # Unit tests (once)
npm run test:e2e            # E2E tests (auto-builds)
cd transcribe && uv run pytest tests/ -v  # Python tests

# Run specific test file
npx playwright test tests/electron/file-save.electron.spec.ts
npm test src/utils/findIndexOfRowForTime.test.ts
```

### Test Status

**All 282/282 tests passing** (187 TypeScript unit + 71 E2E + 24 Python)

### Platform Notes

- **macOS**: All tests work out of the box
- **Linux/Docker**: E2E tests need Xvfb (auto-starts in devcontainer)
  - If Xvfb dies: `pkill Xvfb && pkill -9 electron && start-xvfb.sh`
  - Tests need `DISPLAY=:99` in Linux environments

## Architecture Essentials

### State Management
- Pinia store (`vttStore.ts`)
- Immutable document model
- Cues always sorted by start/end time

### VTT Format
- Metadata in NOTE comments with `CAPTION_EDITOR_SENTINEL` prefix
- Media file paths stored as **absolute** internally, **relative** when serialized
- Speaker embeddings stored as `SegmentSpeakerEmbedding` NOTE comments

### Key Features

**Native Electron Menu**
- Menu in `electron/main.ts`, actions via IPC
- Includes "AI Annotations → Caption with Speech Recognizer"

**ASR Integration**
- Dev mode: Uses `uv run python transcribe.py`
- Production: Uses bundled `uvx` to fetch from GitHub at specific commit
- Default model: `nvidia/parakeet-tdt-0.6b-v3`
- Test override: Set `window.__ASR_MODEL_OVERRIDE = 'openai/whisper-tiny'`

**Sequential Playback**
- Plays segments in table order, skipping gaps
- Playlist captured at start via `forEachNodeAfterFilterAndSort()`

**Word Timestamp Preservation**
- `realignWords()` uses LCS algorithm to preserve timestamps after edits
- New/modified words get no timestamps, unchanged words keep original

### Key Utilities
- `findIndexOfRowForTime(cues, time)`: Find cue index for time
- `serializeVTT(document)`: Convert to VTT string (converts paths to relative)
- `parseVTT(content)`: Parse VTT string to document
- `realignWords(originalWords, editedText)`: Preserve word timestamps

## Common Issues

### AG Grid Row Selection
Call `deselectAll()` before `setSelected(true)`:
```typescript
gridApi.value.deselectAll()
rowNode.setSelected(true)
```

### Test Button Clicks
Use `page.evaluate()` to click directly when elements are obscured:
```typescript
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button'))
    .find(b => b.textContent?.includes('Button Text'))
  if (btn) btn.click()
})
```

### AG Grid Known Bugs
1. **Ghost rows**: Filter by content in tests (`text.length > 0`)
2. **Row ordering**: Rows stay in insertion order, not array order (sort by time in tests)

## Python Tools

### Transcription (transcribe/transcribe.py)
```bash
cd transcribe
uv run python transcribe.py audio.wav \
  --max-intra-segment-gap-seconds 2.0 \
  --max-segment-duration-seconds 10.0
```

Three-pass pipeline: split by gaps, split long segments, resolve overlaps.

### Speaker Embeddings (transcribe/embed.py)
```bash
cd transcribe
uv run python embed.py file.vtt  # Uses wespeaker (no token required)
```

Adds 256-dimensional speaker embeddings to VTT as NOTE comments.

### UVX Distribution
Package for distribution: `./scripts/package-for-uvx.sh`
- Creates wheel, source dist, and `overrides.txt` in `dist-uvx/`
- `overrides.txt` needed to bypass nemo-toolkit's overly conservative numpy constraint
