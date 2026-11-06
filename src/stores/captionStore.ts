import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import type { CaptionsDocument, TranscriptSegment, UIState } from '../types/schema'
import { DEFAULT_PLAYBACK_RATE, nearestPlaybackRate } from '../types/schema'
import {
  createEmptyDocument,
  addSegment as addSegmentToDoc,
  updateSegment as updateSegmentInDoc,
  deleteSegment as deleteSegmentFromDoc,
  renameSpeaker as renameSpeakerInDoc,
  splitSegment as splitSegmentInDoc,
  mergeAdjacentSegments as mergeAdjacentSegmentsInDoc,
  getCurrentTimestamp
} from '../utils/captionsUtils'
import { parseCaptionsJSON5, serializeCaptionsJSON5 } from '../utils/captionsJson5'
import { createDocumentFromSrtContent } from '../utils/srt'

/**
 * Playback modes for the media player
 */
export enum PlaybackMode {
  /** Not playing - media is paused or stopped */
  STOPPED = 'STOPPED',
  /** Normal continuous playback - media plays forward normally */
  MEDIA_PLAYING = 'MEDIA_PLAYING',
  /** Playlist-based segment playback - plays specific segments in order */
  SEGMENTS_PLAYING = 'SEGMENTS_PLAYING'
}

export const useCaptionStore = defineStore('captions', () => {
  // State - all state lives in memory only, persisted by saving `.captions_json5` files
  const document = ref<CaptionsDocument>(createEmptyDocument())

  // Media URL - always a media:// URL in Electron mode
  // Example: media:///Users/name/path/to/audio.wav
  const mediaPath = ref<string | null>(null)

  const currentTime = ref(0)
  const isPlaying = ref(false)  // Kept for compatibility with media element events
  const selectedSegmentId = ref<string | null>(null)

  /**
   * The row the user put the selection on *deliberately* (clicked a row, picked one from the
   * context menu, started playlist playback). While the playhead is still inside that segment
   * the selection stays "pinned" there and playhead-driven auto-selection is suppressed.
   *
   * Why this exists: after ASR, neighbouring segments touch or overlap by a few milliseconds.
   * Clicking a row seeks to its `startTime`, but the media element then reports a position a
   * frame *earlier* — which falls inside the previous segment. Auto-selection would move the
   * selection (and, under a speaker-similarity sort, the viewport) to that unrelated row, so
   * the next field you tried to edit belonged to a different segment.
   *
   * The pin releases itself as soon as the playhead genuinely leaves the segment — by playing
   * past its end or by being dragged elsewhere — which is exactly when following the playhead
   * is what the user means.
   */
  const pinnedSegmentId = ref<string | null>(null)
  /** Where the playhead was when the pin was set, so we can tell "moved" from "jittered". */
  const pinnedAtTime = ref(0)

  // Playback mode state - single source of truth for playback status
  const playbackMode = ref<PlaybackMode>(PlaybackMode.STOPPED)

  // Playlist-based playback state (only used in SEGMENTS_PLAYING mode)
  const playlist = ref<string[]>([])  // Ordered list of segment IDs to play
  const playlistIndex = ref(0)  // Current position in the playlist
  const playlistStartIndex = ref(0)  // Starting position (for returning after completion)
  /**
   * Dirty tracking. Two flags with deliberately different policies:
   *
   * - `isDirty` (content): the transcript itself differs from what is on disk —
   *   segments, speakers, title, media attachment. Blocks quit/open with a modal.
   * - `viewDirty`: only view state changed — grid layout, filters, playhead,
   *   selection. Saved opportunistically on close, but never prompts. Scrolling
   *   the table should not produce an "unsaved changes" dialog.
   *
   * `isDirty` is set in exactly one place: a shallow watcher on `document`. The
   * document model is immutable, so every mutating action replaces `document.value`
   * wholesale — there is no need for (and no way to forget) a per-action flag.
   */
  const isDirty = ref(false)
  const viewDirty = ref(false)

  /** Depth counter for document replacements that must not count as content edits. */
  let suppressContentDirty = 0

  /* -------------------------------------------------------------------------
   * Undo / redo.
   *
   * This is nearly free because of the immutable document model: every mutating
   * action replaces `document.value` wholesale, so a history entry is one object
   * reference, not a copy. The untouched parts — the `segments` array when only
   * `title` changed, the `embeddings` array in almost every edit — are shared
   * between versions rather than duplicated. That matters: embeddings are a
   * base64 float32 vector per segment, and deep-copying them per keystroke would
   * not be viable.
   *
   * The boundary of what is undoable is the same one `isDirty` already uses: a
   * content change. `withoutDirtying()` replacements (`updateFilePath`, which
   * only moves a runtime-only field) are not edits and do not enter the history.
   *
   * `selectedSegmentId` rides along with each entry. Undoing a delete that puts a
   * row back but leaves you selected somewhere else is disorienting, and the
   * selection is a single string, so there is no reason not to.
   * ---------------------------------------------------------------------- */

  interface HistoryEntry {
    readonly document: CaptionsDocument
    readonly selectedSegmentId: string | null
  }

  /**
   * Bounded so a long session cannot grow without limit. Entries are cheap, but
   * "cheap" is not "free" — each one pins whichever segment arrays it references,
   * so a 1000-segment document edited 500 times would hold every intermediate
   * `segments` array alive.
   */
  const UNDO_LIMIT = 100

  const undoStack = ref<HistoryEntry[]>([])
  const redoStack = ref<HistoryEntry[]>([])

  /** Set while undo/redo is applying, so the watcher does not record its own work. */
  let applyingHistory = false

  /**
   * The document as it was when memory last matched disk.
   *
   * Identity comparison against this is what lets undo clear `isDirty` instead of
   * leaving the file looking edited after you have undone your way back to where
   * you started. Immutability makes `===` exactly the right test.
   */
  let savedDocument: CaptionsDocument | null = null

  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)

  // `flush: 'sync'` so `isDirty` is observable immediately after an action returns,
  // rather than on the next tick.
  watch(document, (_newDoc, oldDoc) => {
    if (suppressContentDirty > 0) return

    if (!applyingHistory && oldDoc) {
      undoStack.value.push({ document: oldDoc, selectedSegmentId: selectedSegmentId.value })
      if (undoStack.value.length > UNDO_LIMIT) undoStack.value.shift()
      // A fresh edit is a new branch; anything that was undone is no longer reachable.
      redoStack.value = []
    }

    isDirty.value = savedDocument === null || document.value !== savedDocument
  }, { flush: 'sync' })

  /** Forget the history. For a new document, where "undo" across the boundary is meaningless. */
  function clearHistory() {
    undoStack.value = []
    redoStack.value = []
  }

  /** Move one entry between the stacks, applying its document. Shared by undo and redo. */
  function applyHistory(from: typeof undoStack, to: typeof redoStack): boolean {
    const entry = from.value.pop()
    if (!entry) return false

    to.value.push({ document: document.value, selectedSegmentId: selectedSegmentId.value })

    applyingHistory = true
    try {
      document.value = entry.document
    } finally {
      applyingHistory = false
    }

    // Only restore a selection that still exists in the document we just restored.
    selectedSegmentId.value =
      entry.selectedSegmentId &&
      entry.document.segments.some((seg) => seg.id === entry.selectedSegmentId)
        ? entry.selectedSegmentId
        : null

    return true
  }

  function undo(): boolean {
    return applyHistory(undoStack, redoStack)
  }

  function redo(): boolean {
    return applyHistory(redoStack, undoStack)
  }

  /** Run `fn` without letting its document replacement mark the content dirty. */
  function withoutDirtying<T>(fn: () => T): T {
    suppressContentDirty++
    try {
      return fn()
    } finally {
      suppressContentDirty--
    }
  }

  /** Memory now matches disk (just loaded, or just saved). */
  function markSaved() {
    isDirty.value = false
    viewDirty.value = false
    // Remembered so undoing back to this exact document clears `isDirty` again.
    savedDocument = document.value
  }

  /** Record that view-only state (grid layout, playhead, selection) changed. */
  function markViewDirty() {
    viewDirty.value = true
  }

  /* -------------------------------------------------------------------------
   * Cross-component state that used to travel outside the store.
   *
   * Three things were being passed between CaptionTable and App.vue by other
   * means: the set of rows an action targets (a `window.__captionTableSelectedRows`
   * global), a request to open the delete dialog (a DOM `CustomEvent`), and a
   * request to sort by speaker similarity (another `CustomEvent`, in the other
   * direction). Each was invisible to the type checker and to anyone reading
   * either component on its own.
   * ---------------------------------------------------------------------- */

  /**
   * Every row the grid currently has selected, mirrored out of AG Grid.
   *
   * AG Grid owns selection — it is the widget's own state and there is no sense in
   * fighting that — but nothing outside the table should have to reach into the grid
   * API to find out what is selected. `CaptionTable` pushes the ids here on every
   * selection change; everyone else reads them.
   *
   * Distinct from `selectedSegmentId`, which is the *anchor*: the single row the
   * playhead follows, that `uiState` persists, and that the selection pin keys off.
   */
  const selectedSegmentIds = ref<string[]>([])

  /**
   * Segments awaiting the user's confirmation in the delete dialog, or null.
   *
   * Set by the table's context menu, read by `App.vue` to open the dialog. The
   * row ids travel in the state rather than in a global the dialog reads back,
   * so the set that gets deleted is the set the menu targeted — not whatever the
   * grid happens to have selected by the time the user clicks Delete.
   */
  const pendingDeletion = ref<readonly string[] | null>(null)

  /**
   * Bumped to ask the table to sort by speaker similarity.
   *
   * A counter rather than a boolean because it is an event, not a state: asking
   * twice in a row has to fire twice, and there is nothing to reset afterwards.
   */
  const speakerSimilarityRequest = ref(0)

  function setSelectedSegmentIds(ids: string[]) {
    selectedSegmentIds.value = ids
  }

  function requestSegmentDeletion(segmentIds: readonly string[]) {
    pendingDeletion.value = [...segmentIds]
  }

  function clearPendingDeletion() {
    pendingDeletion.value = null
  }

  /** Confirm the pending deletion. No-op when nothing is pending. */
  function confirmPendingDeletion() {
    const ids = pendingDeletion.value
    pendingDeletion.value = null
    if (ids && ids.length > 0) bulkDeleteSegments([...ids])
  }

  function requestSpeakerSimilaritySort() {
    speakerSimilarityRequest.value++
  }

  // Grid state provider: CaptionTable registers a callback that returns current grid UI state
  const gridStateProvider = ref<(() => UIState | undefined) | null>(null)

  // Layout state (persisted in uiState)
  const leftPanelWidth = ref(60)  // Percentage width of left (table) panel
  const captionHeight = ref(120)  // Pixel height of caption display area

  /**
   * Playback speed multiplier, persisted with the document.
   *
   * Per-document rather than a Preference: the right speed is a property of *this recording* —
   * a fast talker or a noisy interview wants 0.75x while a clear dictation is comfortable at
   * 1.5x — so it should come back with the transcript instead of following the user onto the
   * next file.
   */
  const playbackRate = ref(DEFAULT_PLAYBACK_RATE)

  // Dragging the panel splitter or the caption-height handle, or picking a playback speed, is
  // view state: persisted, but never a reason to prompt about unsaved changes.
  watch([leftPanelWidth, captionHeight, playbackRate], () => markViewDirty(), { flush: 'sync' })

  // Computed
  // If the playhead is not inside any segment but is within this many seconds
  // before the next segment's start, show that upcoming segment instead.
  const PLAYHEAD_FORWARD_EPSILON_SECONDS = 1.0

  /**
   * How far *before* a pinned segment's start the pin still holds. Covers the media element
   * landing a frame or two short of a requested seek; wide enough for 1-2 video frames, far
   * too small to reach a neighbouring caption of any real length.
   */
  const PIN_HOLD_LEAD_SECONDS = 0.25

  /**
   * How far the playhead may wander outside the pinned segment before the pin lets go.
   * A row can be selected without seeking (context menu, "Add caption", restoring a file),
   * leaving the playhead parked in some other segment; the pin still has to survive the
   * `timeupdate` events that follow, while a real play or scrubber drag — which moves the
   * playhead much farther than this — releases it.
   */
  const PIN_RELEASE_DRIFT_SECONDS = 0.25

  function pinHoldsAt(time: number): boolean {
    const id = pinnedSegmentId.value
    if (!id) return false
    const segment = document.value.segments.find(s => s.id === id)
    if (!segment) return false
    if (time >= segment.startTime - PIN_HOLD_LEAD_SECONDS && time < segment.endTime) return true
    // Playhead outside the pinned segment: hold only while it hasn't really gone anywhere.
    return Math.abs(time - pinnedAtTime.value) <= PIN_RELEASE_DRIFT_SECONDS
  }

  /**
   * The deliberately-selected segment, but only while the playhead is still inside it.
   * `undefined` means there is nothing to hold onto and the playhead decides.
   */
  const pinnedSegment = computed(() => {
    if (!pinHoldsAt(currentTime.value)) return undefined
    return document.value.segments.find(s => s.id === pinnedSegmentId.value)
  })

  const currentSegment = computed(() => {
    const pinned = pinnedSegment.value
    if (pinned) return pinned

    const time = currentTime.value
    const segments = document.value.segments
    // document.segments is always kept sorted
    const exact = segments.find(
      segment => segment.startTime <= time && time < segment.endTime
    )
    if (exact) return exact

    // Look for the nearest upcoming segment within the epsilon window
    const upcoming = segments.find(
      segment => segment.startTime > time && segment.startTime - time <= PLAYHEAD_FORWARD_EPSILON_SECONDS
    )
    return upcoming ?? undefined
  })

  // Computed property for mediaFilePath - single source of truth from document.metadata
  const mediaFilePath = computed(() => document.value.metadata.mediaFilePath || null)

  // Computed property for current playlist segment (only valid in SEGMENTS_PLAYING mode)
  const currentPlaylistSegment = computed(() => {
    if (playbackMode.value !== PlaybackMode.SEGMENTS_PLAYING || playlistIndex.value >= playlist.value.length) {
      return null
    }
    const segmentId = playlist.value[playlistIndex.value]
    return document.value.segments.find(s => s.id === segmentId) || null
  })

  // Actions
  function loadFromFile(content: string, filePath?: string) {
    const t0 = performance.now()
    console.log('[loadFromFile] start — file:', filePath, `(${(content.length / 1024).toFixed(0)} KB)`)

    // App.vue tracks "already tried auto-load for this metadata.id". A full reload with the
    // same id (e.g. after Compute Speaker Embeddings) must clear that or mediaPath stays null.
    try {
      // Deliberately a cast, not the declared global. `window.$store` is typed as
      // `ReturnType<typeof useCaptionStore>`, so if this file referenced anything from
      // window-globals.d.ts the two would import each other and TypeScript would resolve
      // the store's own type to an empty `Store<"captions", {}, {}, {}>` — which silently
      // turns every `window.$store.…` in the specs back into an unchecked `any`.
      const reset = (window as { __resetAttemptedAutoLoad?: () => void }).__resetAttemptedAutoLoad
      if (typeof reset === 'function') reset()
    } catch {
      /* ignore outside Electron */
    }

    // Reset all state so the new file starts clean (media, playback, selection, etc.)
    mediaPath.value = null
    currentTime.value = 0
    isPlaying.value = false
    selectedSegmentId.value = null
    pinnedSegmentId.value = null
    playbackMode.value = PlaybackMode.STOPPED
    playlist.value = []
    playlistIndex.value = 0
    playlistStartIndex.value = 0

    const t1 = performance.now()
    const result = parseCaptionsJSON5(content)
    const t2 = performance.now()
    console.log(`[loadFromFile] parseCaptionsJSON5: ${(t2 - t1).toFixed(1)} ms`)

    if (result.success && result.document) {
      const loadedDoc = {
        ...result.document,
        filePath
      }

      // Convert relative media file path to absolute path
      // According to architecture: paths are stored as absolute internally, relative only on export
      try {
        const electronAPI = window.electronAPI
        if (loadedDoc.metadata.mediaFilePath && filePath && electronAPI?.path) {
          const mediaPath = loadedDoc.metadata.mediaFilePath
          // Only convert if it's a relative path
          if (!electronAPI.path.isAbsolute(mediaPath)) {
            const captionsDir = electronAPI.path.dirname(filePath)
            const absoluteMediaPath = electronAPI.path.resolve(captionsDir, mediaPath)
            console.log('Converting relative media path to absolute:')
            console.log('  Relative:', mediaPath)
            console.log('  Captions dir:', captionsDir)
            console.log('  Absolute:', absoluteMediaPath)
            loadedDoc.metadata = {
              ...loadedDoc.metadata,
              mediaFilePath: absoluteMediaPath
            }
          }
        }
      } catch (error) {
        console.error('Error converting media path to absolute:', error)
        // Continue loading even if path conversion fails
      }

      document.value = loadedDoc

      // Restore layout dimensions from persisted uiState
      if (loadedDoc.uiState?.leftPanelWidth != null) {
        leftPanelWidth.value = loadedDoc.uiState.leftPanelWidth
      }
      if (loadedDoc.uiState?.captionHeight != null) {
        captionHeight.value = loadedDoc.uiState.captionHeight
      }
      // Snapped, not trusted: an out-of-range rate from a hand-edited file would otherwise
      // reach the media element and leave the <select> showing no matching option.
      playbackRate.value = loadedDoc.uiState?.playbackRate != null
        ? nearestPlaybackRate(loadedDoc.uiState.playbackRate)
        : DEFAULT_PLAYBACK_RATE

      // Restore where the user left off (Lightroom-style): playhead position and
      // selected row. Selection is keyed by segment UUID, so it survives sorting,
      // filtering, and edits made since the file was written.
      if (loadedDoc.uiState?.playheadSeconds != null && loadedDoc.uiState.playheadSeconds > 0) {
        currentTime.value = loadedDoc.uiState.playheadSeconds
      }
      const restoredSelection = loadedDoc.uiState?.selectedSegmentId
      if (restoredSelection && loadedDoc.segments.some(s => s.id === restoredSelection)) {
        // Reopening a file puts you back on the row you left off on, and that counts as a
        // deliberate selection: pin it so the restored playhead cannot immediately move it.
        selectedSegmentId.value = restoredSelection
        pinnedSegmentId.value = restoredSelection
        pinnedAtTime.value = currentTime.value
      }

      // A different document: undoing across the boundary would resurrect the
      // previous file's segments into this one.
      clearHistory()

      // Memory now matches disk. Must come after the restores above so that
      // nothing in this function leaves the document looking edited.
      markSaved()

      const t3 = performance.now()
      console.log(`[loadFromFile] done — ${document.value.segments.length} segments, total: ${(t3 - t0).toFixed(1)} ms`)
    } else {
      console.error('Failed to load captions:', result.error)
      throw new Error(result.error || 'Failed to parse captions file')
    }
  }

  function loadFromSrt(content: string) {
    console.log('Importing segments from SRT')
    const result = createDocumentFromSrtContent(content)
    if (!result.success) {
      console.error('Failed to import SRT:', result.error)
      throw new Error(result.error || 'Failed to parse SRT file')
    }

    // SRT is an import format only; do not set document.filePath to the .srt path.
    document.value = {
      ...result.document,
      filePath: undefined
    }

    // Every segment is new, so any remembered selection refers to a segment that no
    // longer exists (same reasoning as mergeAsrResult).
    selectedSegmentId.value = null
    clearHistory()
    pinnedSegmentId.value = null
  }

  /**
   * Load a media file for playback (Electron mode)
   * @param path - media:// URL to use as media element src
   * @param filePath - Absolute file path to store in document metadata (will be converted to relative on export)
   */
  function loadMediaFile(path: string, filePath?: string) {
    console.log('Loading media file:', path, 'with file path:', filePath)
    mediaPath.value = path

    // Store the ABSOLUTE file path in metadata.
    // We'll convert it to a relative path only when exporting/saving the captions JSON file.
    //
    // Only replace the document when the attachment actually changes. Auto-loading the
    // media referenced by a freshly opened file resolves to the path already in metadata;
    // rewriting it there would mark a document dirty that the user has not touched.
    if (filePath && filePath !== document.value.metadata.mediaFilePath) {
      document.value = {
        ...document.value,
        metadata: {
          ...document.value.metadata,
          mediaFilePath: filePath  // Store absolute path
        }
      }
    }
  }

  /** Quantize the playhead so serialized files do not diff on sub-millisecond jitter. */
  function roundPlayhead(seconds: number): number | undefined {
    if (!Number.isFinite(seconds) || seconds <= 0) return undefined
    return Math.round(seconds * 1000) / 1000
  }

  function exportToString(): string {
    console.log('Exporting captions document')
    console.log('  document.value.filePath:', document.value.filePath || '(null)')
    console.log('  document.value.metadata.mediaFilePath:', document.value.metadata.mediaFilePath || '(null)')

    // Convert absolute media path to relative path for captions JSON export.
    // This is important for portability and for Save As operations where the captions file moves.
    let documentToExport = document.value

    const absoluteMediaPath = document.value.metadata.mediaFilePath
    const electronAPI = window.electronAPI

    if (absoluteMediaPath && document.value.filePath && electronAPI?.path) {
      try {
        // Check if the media path is already absolute (using Node.js path module)
        if (electronAPI.path.isAbsolute(absoluteMediaPath)) {
          // Compute the relative path from the captions file directory to the media file
          const captionsDir = electronAPI.path.dirname(document.value.filePath)
          console.log('  Captions directory:', captionsDir)
          console.log('  Computing relative path from', captionsDir, 'to', absoluteMediaPath)

          // Use Node.js path.relative() to compute the relative path
          const relativeMediaPath = electronAPI.path.relative(captionsDir, absoluteMediaPath)

          console.log('Converting media path for export:')
          console.log('  Captions file path:', document.value.filePath)
          console.log('  Absolute media path:', absoluteMediaPath)
          console.log('  Relative path:', relativeMediaPath)

          // Update the document metadata with the relative path for export
          documentToExport = {
            ...document.value,
            metadata: {
              ...document.value.metadata,
              mediaFilePath: relativeMediaPath
            }
          }
        } else {
          // It's already a relative path, no conversion needed
          console.log('  Media path is already relative:', absoluteMediaPath)
        }
      } catch (error) {
        console.error('Error converting media path to relative:', error)
        // Fall back to original document
      }
    }

    // Inject current UI state (grid state + layout dimensions + where the user is)
    const gridUiState = gridStateProvider.value ? gridStateProvider.value() : undefined
    const uiState: UIState = {
      ...gridUiState,
      leftPanelWidth: leftPanelWidth.value,
      captionHeight: captionHeight.value,
      playbackRate: playbackRate.value,
      // Rounded so that ordinary playback does not churn the file on every frame.
      playheadSeconds: roundPlayhead(currentTime.value),
      // Only persist a selection that still exists, so a stale id never lands on disk.
      selectedSegmentId:
        selectedSegmentId.value &&
        documentToExport.segments.some(seg => seg.id === selectedSegmentId.value)
          ? selectedSegmentId.value
          : undefined,
    }
    documentToExport = { ...documentToExport, uiState }

    return serializeCaptionsJSON5(documentToExport)
  }

  function updateTitle(title: string) {
    console.log('Updating document title:', title)
    document.value = {
      ...document.value,
      title: title || undefined
    }
  }

  function updateFilePath(filePath: string) {
    console.log('Updating file path:', filePath)
    // `filePath` is runtime-only (never serialized), so pointing the document at a
    // different file on disk is not itself a content edit.
    withoutDirtying(() => {
      document.value = {
        ...document.value,
        filePath
      }
    })
  }

  function addSegment(startTime: number, duration: number = 5) {
    console.log('Adding new segment at', startTime, 'with duration', duration)
    const newSegment: TranscriptSegment = {
      id: uuidv4(),
      index: 0, // placeholder; will be corrected by reindexSegments
      startTime,
      endTime: startTime + duration,
      text: 'New caption',
      rating: undefined,
      timestamp: getCurrentTimestamp()
    }

    document.value = addSegmentToDoc(document.value, newSegment)
    return newSegment.id
  }

  function updateSegment(segmentId: string, updates: Partial<Omit<TranscriptSegment, 'id'>>) {
    console.log('Updating segment:', segmentId, updates)

    // Validate timestamps if provided
    if (updates.startTime !== undefined && updates.endTime !== undefined) {
      if (updates.endTime <= updates.startTime) {
        throw new Error('End time must be greater than start time')
      }
    } else if (updates.startTime !== undefined) {
      const segment = document.value.segments.find(c => c.id === segmentId)
      if (segment && updates.startTime >= segment.endTime) {
        throw new Error('Start time must be less than end time')
      }
    } else if (updates.endTime !== undefined) {
      const segment = document.value.segments.find(c => c.id === segmentId)
      if (segment && updates.endTime <= segment.startTime) {
        throw new Error('End time must be greater than start time')
      }
    }

    document.value = updateSegmentInDoc(document.value, segmentId, updates)
  }

  function deleteSegment(segmentId: string) {
    console.log('Deleting segment:', segmentId)
    document.value = deleteSegmentFromDoc(document.value, segmentId)
    if (selectedSegmentId.value === segmentId) {
      selectedSegmentId.value = null
    }
  }

  function renameSpeaker(oldName: string, newName: string) {
    console.log('Renaming speaker in store:', oldName, '->', newName)
    document.value = renameSpeakerInDoc(document.value, oldName, newName)
  }

  function bulkSetSpeaker(segmentIds: string[], speakerName: string) {
    console.log('Bulk setting speaker for', segmentIds.length, 'segments to:', speakerName)

    // Update each segment with the new speaker name
    let updatedDoc = document.value
    for (const segmentId of segmentIds) {
      updatedDoc = updateSegmentInDoc(updatedDoc, segmentId, { speakerName })
    }

    document.value = updatedDoc
  }

  function bulkSetVerified(segmentIds: string[], verified: boolean) {
    console.log('Bulk setting verified for', segmentIds.length, 'segments to:', verified)
    let updatedDoc = document.value
    for (const segmentId of segmentIds) {
      updatedDoc = updateSegmentInDoc(updatedDoc, segmentId, { verified: verified || undefined })
    }
    document.value = updatedDoc
  }

  function bulkSetRating(segmentIds: string[], rating: number | undefined) {
    console.log('Bulk setting rating for', segmentIds.length, 'segments to:', rating)
    let updatedDoc = document.value
    for (const segmentId of segmentIds) {
      updatedDoc = updateSegmentInDoc(updatedDoc, segmentId, { rating })
    }
    document.value = updatedDoc
  }

  function bulkDeleteSegments(segmentIds: string[]) {
    console.log('Bulk deleting', segmentIds.length, 'segments')

    // Delete each segment
    let updatedDoc = document.value
    for (const segmentId of segmentIds) {
      updatedDoc = deleteSegmentFromDoc(updatedDoc, segmentId)
    }

    document.value = updatedDoc

    // Clear selectedSegmentId if it was deleted
    if (selectedSegmentId.value && segmentIds.includes(selectedSegmentId.value)) {
      selectedSegmentId.value = null
    }
  }

  function splitSegmentAtWordIndex(segmentId: string, wordIndex: number) {
    console.log('Splitting segment in store:', segmentId, 'at word index:', wordIndex)
    document.value = splitSegmentInDoc(document.value, segmentId, wordIndex)
  }

  function mergeAdjacentSegments(segmentIds: string[]) {
    console.log('Merging adjacent segments in store:', segmentIds)
    document.value = mergeAdjacentSegmentsInDoc(document.value, segmentIds)
  }

  function setCurrentTime(time: number) {
    if (currentTime.value !== time) markViewDirty()
    currentTime.value = time

    // The playhead has left the pinned segment for good — stop holding the selection there.
    if (pinnedSegmentId.value && !pinHoldsAt(time)) {
      pinnedSegmentId.value = null
    }

    // Auto-select current segment (the pinned one while the pin holds)
    const segment = currentSegment.value
    if (segment) {
      selectedSegmentId.value = segment.id
    }
  }

  function setPlaying(playing: boolean) {
    isPlaying.value = playing
  }

  /**
   * Put the selection on a row deliberately. This also *pins* it: until the playhead leaves
   * that segment, nothing driven by the playhead may move the selection elsewhere.
   */
  function selectSegment(segmentId: string | null) {
    if (selectedSegmentId.value !== segmentId) markViewDirty()
    selectedSegmentId.value = segmentId
    pinnedSegmentId.value = segmentId
    pinnedAtTime.value = currentTime.value
  }

  /**
   * Start playlist-based playback (SEGMENTS_PLAYING mode)
   * @param segmentIds - Ordered array of segment IDs to play
   * @param startIndex - Index to start playback from (default 0)
   */
  function startPlaylistPlayback(segmentIds: string[], startIndex: number = 0) {
    console.log('Starting playlist playback with', segmentIds.length, 'segments, starting at index', startIndex)
    playbackMode.value = PlaybackMode.SEGMENTS_PLAYING
    playlist.value = segmentIds
    playlistIndex.value = startIndex
    playlistStartIndex.value = startIndex

    // Start playing the first segment
    const segment = currentPlaylistSegment.value
    if (segment) {
      console.log('Playing first segment in playlist:', segment.id)
      setCurrentTime(segment.startTime)
      setPlaying(true)
      selectSegment(segment.id)
    }
  }

  /**
   * Stop playlist playback and return to STOPPED mode
   * @param returnToStart - If true, return playhead to the start of the first segment in the playlist
   */
  function stopPlaylistPlayback(returnToStart: boolean = false) {
    console.log('Stopping playlist playback, returnToStart:', returnToStart)

    // Return to start of playlist if requested
    if (returnToStart && playlist.value.length > 0) {
      const firstSegmentId = playlist.value[playlistStartIndex.value]
      const firstSegment = document.value.segments.find(s => s.id === firstSegmentId)
      if (firstSegment) {
        console.log('Returning to start of playlist:', firstSegmentId)
        setCurrentTime(firstSegment.startTime)
        selectSegment(firstSegmentId)
      }
    }

    playbackMode.value = PlaybackMode.STOPPED
    playlist.value = []
    playlistIndex.value = 0
    playlistStartIndex.value = 0
    setPlaying(false)
  }

  /**
   * Move to the next segment in the playlist
   * @param playheadTime - If set, sync the store to this clock position instead of the
   *   next segment’s `startTime`. Used by sequential playback when the timeline gap to the
   *   next row is small: the media element does not seek (avoids decoder/keyframe stutter),
   *   but selection and UI still follow the new row.
   * @returns true if there's a next segment, false if we've reached the end
   */
  function nextPlaylistSegment(playheadTime?: number): boolean {
    if (playbackMode.value !== PlaybackMode.SEGMENTS_PLAYING) {
      return false
    }

    const nextIndex = playlistIndex.value + 1
    if (nextIndex >= playlist.value.length) {
      console.log('Reached end of playlist')
      stopPlaylistPlayback(true)  // Return to start when playlist completes
      return false
    }

    console.log('Moving to next segment in playlist, index:', nextIndex)
    playlistIndex.value = nextIndex
    const segment = currentPlaylistSegment.value
    if (segment) {
      console.log('Playing next segment:', segment.id)
      if (playheadTime !== undefined) {
        setCurrentTime(playheadTime)
      } else {
        setCurrentTime(segment.startTime)
      }
      selectSegment(segment.id)
      return true
    }

    return false
  }

  /**
   * Cancel playlist playback due to manual intervention (e.g., scrubbing)
   * Returns to STOPPED mode without returning to start
   */
  function cancelPlaylistPlayback() {
    console.log('Canceling playlist playback due to manual intervention')
    playbackMode.value = PlaybackMode.STOPPED
    playlist.value = []
    playlistIndex.value = 0
    playlistStartIndex.value = 0
  }

  /**
   * Merge ASR transcription results into the current document.
   * Replaces segments (and preserves embeddings from ASR result) but preserves document identity
   * (metadata.id, title, history, uiState, filePath, mediaFilePath).
   */
  function mergeAsrResult(content: string) {
    const result = parseCaptionsJSON5(content)
    if (!result.success || !result.document) {
      throw new Error(result.error || 'Failed to parse ASR result')
    }
    const asrDoc = result.document
    document.value = {
      ...document.value,
      segments: asrDoc.segments,
      embeddings: asrDoc.embeddings,
      embeddingModel: asrDoc.embeddingModel,
    }

    // ASR replaces every segment, so the previously selected UUID is almost certainly
    // gone. Keep the playhead (it still refers to the same audio) but drop the selection.
    if (selectedSegmentId.value && !asrDoc.segments.some(s => s.id === selectedSegmentId.value)) {
      selectedSegmentId.value = null
      pinnedSegmentId.value = null
    }
  }

  /**
   * Explicit override. `setIsDirty(false)` means "memory matches disk" and therefore
   * also clears the view-dirty flag; prefer calling `markSaved()` directly.
   */
  function setIsDirty(value: boolean) {
    if (value) {
      isDirty.value = true
    } else {
      markSaved()
    }
  }

  /**
   * Processes an array of file paths (VTT or media) and loads them into the store.
   * @param filePaths Array of absolute file paths to process
   * @returns Object containing counts of successes and failures
   */
  async function processFilePaths(filePaths: string[]): Promise<{ successes: number; failures: number }> {
    const t0 = performance.now()
    const electronAPI = window.electronAPI
    if (!electronAPI || !electronAPI.processDroppedFiles) {
      console.error('Electron processDroppedFiles API not available')
      throw new Error('File processing API not available')
    }

    let successes = 0
    let failures = 0

    try {
      const results = await electronAPI.processDroppedFiles(filePaths)
      const t1 = performance.now()
      console.log(`[processFilePaths] IPC processDroppedFiles: ${(t1 - t0).toFixed(1)} ms for ${filePaths.length} file(s)`)

      for (const result of results) {
        try {
          if (result.type === 'captions_json5' && result.content) {
            loadFromFile(result.content, result.filePath)
            console.log('[captionStore] Captions file loaded successfully:', result.fileName)
            successes++
          } else if (result.type === 'srt' && result.content) {
            loadFromSrt(result.content)
            console.log('[captionStore] SRT file imported successfully:', result.fileName)
            successes++
          } else if (result.type === 'media' && result.url) {
            loadMediaFile(result.url, result.filePath)
            console.log('[captionStore] Media file loaded successfully:', result.fileName)
            successes++
          }
        } catch (err) {
          console.error(`[captionStore] Failed to load file ${result.fileName}:`, err)
          failures++
        }
      }
    } catch (err) {
      console.error('[captionStore] Failed to process files:', err)
      failures = filePaths.length
    }

    return { successes, failures }
  }

  return {
    // State
    document,
    mediaPath,
    mediaFilePath,
    currentTime,
    isPlaying,
    selectedSegmentId,
    playbackMode,
    playlist,
    playlistIndex,
    playlistStartIndex,
    isDirty,
    viewDirty,
    canUndo,
    canRedo,
    selectedSegmentIds,
    pendingDeletion,
    speakerSimilarityRequest,
    gridStateProvider,
    leftPanelWidth,
    captionHeight,
    playbackRate,

    // Computed
    currentSegment,
    pinnedSegment,
    currentPlaylistSegment,

    // Actions
    loadFromFile,
    loadMediaFile,
    mergeAsrResult,
    exportToString,
    updateTitle,
    updateFilePath,
    setIsDirty,
    markSaved,
    setSelectedSegmentIds,
    requestSegmentDeletion,
    clearPendingDeletion,
    confirmPendingDeletion,
    requestSpeakerSimilaritySort,
    undo,
    redo,
    clearHistory,
    markViewDirty,
    processFilePaths,
    addSegment,
    updateSegment,
    deleteSegment,
    renameSpeaker,
    bulkSetSpeaker,
    bulkSetVerified,
    bulkSetRating,
    bulkDeleteSegments,
    splitSegmentAtWordIndex,
    mergeAdjacentSegments,
    setCurrentTime,
    setPlaying,
    selectSegment,
    startPlaylistPlayback,
    stopPlaylistPlayback,
    nextPlaylistSegment,
    cancelPlaylistPlayback,
    reset() {
      document.value = createEmptyDocument()
      mediaPath.value = null
      currentTime.value = 0
      isPlaying.value = false
      selectedSegmentId.value = null
      pinnedSegmentId.value = null
      playbackMode.value = PlaybackMode.STOPPED
      playlist.value = []
      playlistIndex.value = 0
      playlistStartIndex.value = 0
      leftPanelWidth.value = 60
      captionHeight.value = 120
      playbackRate.value = DEFAULT_PLAYBACK_RATE
      // After the replacement above, not before: the watcher records the outgoing
      // document, so clearing first would leave that one entry behind.
      clearHistory()
      markSaved()
    }
  }
})

