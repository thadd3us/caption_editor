<template>
  <div class="media-player">
    <div v-if="hasMedia && mediaFileName" class="media-info">
      <button
        type="button"
        class="show-in-finder-btn tooltip-btn"
        data-tooltip-placement="right"
        @click="showMediaInFinder"
        data-tooltip="Reveal the media file in Finder"
      >📁</button>
      <span class="media-filename">{{ mediaFileName }}</span>
    </div>
    <div class="video-container">
      <video
        v-if="store.mediaPath && isVideo"
        ref="videoElement"
        :src="store.mediaPath"
        @loadedmetadata="onMediaLoaded"
        @timeupdate="onTimeUpdate"
        @play="onPlay"
        @pause="onPause"
        @ratechange="onMediaRateChange"
        controls
      />
      <audio
        v-else-if="store.mediaPath && !isVideo"
        ref="audioElement"
        :src="store.mediaPath"
        @loadedmetadata="onMediaLoaded"
        @timeupdate="onTimeUpdate"
        @play="onPlay"
        @pause="onPause"
        @ratechange="onMediaRateChange"
        controls
      />
      <div v-else class="no-media">
        <p>No media loaded</p>
        <p class="hint">Drop a video or audio file to get started</p>
      </div>
    </div>

    <div class="controls">
      <div class="playback-controls">
        <button
          type="button"
          @click="togglePlayPause"
          class="control-btn tooltip-btn"
          :disabled="!hasMedia"
          :data-tooltip="store.isPlaying ? 'Pause the media' : 'Play the media file'"
        >
          {{ store.isPlaying ? '⏸️' : '▶️' }}
        </button>
        <span class="time-display">{{ formatTime(store.currentTime) }}</span>
        <input
          ref="scrubberElement"
          type="range"
          class="scrubber"
          :value="store.currentTime"
          :max="duration"
          step="0.001"
          :disabled="!hasMedia"
          @input="onScrub"
        />
        <span class="time-display">{{ formatTime(duration) }}</span>
        <label class="speed-control tooltip-btn" data-tooltip="Playback speed">
          <select
            class="speed-select"
            data-testid="playback-speed"
            :value="store.playbackRate"
            :disabled="!hasMedia"
            @change="onPlaybackRateChange"
          >
            <option v-for="rate in PLAYBACK_RATE_OPTIONS" :key="rate" :value="rate">
              {{ formatRate(rate) }}
            </option>
          </select>
        </label>
      </div>

      <div class="caption-resizer" @mousedown="startCaptionResize"></div>
      <div
        class="current-caption-display"
        :style="{ height: store.captionHeight + 'px' }"
        @dblclick="beginCaptionEdit"
      >
        <div class="caption-label">
          <span>Current Caption:</span>
          <span v-if="isEditingCaption" class="caption-hint">Enter to save · Esc to cancel</span>
          <span v-else-if="currentSegment" class="caption-hint">Double-click to edit</span>
        </div>
        <textarea
          v-if="isEditingCaption"
          ref="captionEditorElement"
          v-model="captionDraft"
          class="caption-editor"
          data-testid="caption-editor"
          spellcheck="true"
          @keydown="onCaptionEditorKeydown"
          @blur="commitCaptionEdit"
        ></textarea>
        <div
          v-else
          class="caption-text"
          @contextmenu="onCaptionContextMenu"
          @click="onCaptionWordClick"
        >
          <template v-if="currentSegment && currentSegment.words && currentSegment.words.length > 0">
            <span
              v-for="(word, index) in currentSegment.words"
              :key="index"
              class="word-span"
              :class="{ 'word-active': index === currentWordIndex }"
              :data-word-index="index"
              :data-has-timestamp="word.startTime !== undefined"
            >{{ word.text }}</span>{{ ' ' }}
          </template>
          <template v-else>
            {{ currentCaptionText }}
          </template>
        </div>
      </div>
    </div>

    <!-- Context Menu -->
    <ContextMenu
      :is-visible="isContextMenuVisible"
      :position="contextMenuPosition"
      :items="contextMenuItems"
      @close="isContextMenuVisible = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { useCaptionStore, PlaybackMode } from '../stores/captionStore'
import { usePreferencesStore } from '../stores/preferencesStore'
import { PLAYBACK_RATE_OPTIONS, nearestPlaybackRate } from '../types/schema'
import ContextMenu from './ContextMenu.vue'
import type { ContextMenuItem } from './ContextMenu.types'

const store = useCaptionStore()
const prefs = usePreferencesStore()
const videoElement = ref<HTMLVideoElement | null>(null)
const audioElement = ref<HTMLAudioElement | null>(null)
const duration = ref(0)
const segmentEndTime = ref<number | null>(null)  // Track when current segment should end
const scrubberElement = ref<HTMLInputElement | null>(null)
const isManualScrub = ref(false)  // Track if user is manually scrubbing

/**
 * Sequential playlist: seek to each row’s start only when the timeline gap is “large”.
 *
 * Adjacent rows often have <~500ms between previous `endTime` and next `startTime` (or
 * overlap). Forcing `currentTime = next.startTime` still runs a real seek; decoders often
 * snap to keyframes or quantized times, so the playhead can jump slightly backward and
 * sound/video stutters. If the gap is small, leaving the clock alone matches continuous
 * playback and still updates selection + segment end via `segmentEndTime`.
 */
const SEQUENTIAL_PLAYBACK_GAP_SEEK_THRESHOLD_SEC = 0.5

// Context menu state
const isContextMenuVisible = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const contextMenuItems = ref<ContextMenuItem[]>([])
const currentSegment = computed(() => store.currentSegment)

const currentWordIndex = computed(() => {
  const seg = currentSegment.value
  if (!seg?.words) return -1
  const t = store.currentTime
  for (let i = seg.words.length - 1; i >= 0; i--) {
    const w = seg.words[i]
    if (w.startTime != null && w.startTime <= t) {
      if (w.endTime != null && t >= w.endTime) return -1
      return i
    }
  }
  return -1
})

/**
 * Inline editing of the current caption.
 *
 * Two deliberate design points:
 *
 * 1. **Display and edit are different elements.** `currentWordIndex` recomputes on every
 *    `timeupdate`, so the word-span view is re-patched several times a second. Making that view
 *    `contenteditable` would destroy the caret and selection mid-keystroke, so edit mode swaps in
 *    a plain <textarea> bound to a local draft instead.
 *
 * 2. **The edit target is pinned by id, not by playhead.** `store.currentSegment` follows the
 *    playhead, so with playback running the "current" segment changes while you type. We capture
 *    the segment id at edit start and commit to *that* id, which is what lets playback continue
 *    during editing (`pausePlaybackWhileEditingCaption` preference, default off).
 *
 * Committing routes through `store.updateSegment()` — identical to the table's text column — so
 * word timestamps are realigned by `realignWords()` and the table updates reactively.
 */
const editingSegmentId = ref<string | null>(null)
const captionDraft = ref('')
const captionEditorElement = ref<HTMLTextAreaElement | null>(null)
const isEditingCaption = computed(() => editingSegmentId.value !== null)

function beginCaptionEdit() {
  // A double-click inside the open editor bubbles up here; restarting would drop the draft.
  if (isEditingCaption.value) return

  const segment = currentSegment.value
  if (!segment) return

  console.log('Editing caption in player panel for segment:', segment.id)
  editingSegmentId.value = segment.id
  captionDraft.value = segment.text

  // Keep the table in agreement about which row is being worked on.
  store.selectSegment(segment.id)

  if (prefs.preferences.pausePlaybackWhileEditingCaption && store.isPlaying) {
    // Go through the store rather than `mediaElement.pause()`: the `store.isPlaying` watcher
    // below pauses the element, and the resulting `pause` event settles `playbackMode` (including
    // tearing down playlist playback) through the same path as any other pause.
    store.setPlaying(false)
  }

  nextTick(() => {
    const el = captionEditorElement.value
    if (!el) return
    el.focus()
    // Caret at the end rather than select-all: most edits here are small corrections.
    el.setSelectionRange(el.value.length, el.value.length)
  })
}

function commitCaptionEdit() {
  const segmentId = editingSegmentId.value
  if (segmentId === null) return

  // Clear first so the `blur` that follows Enter/Escape is a no-op.
  editingSegmentId.value = null

  const text = captionDraft.value.trim()
  const segment = store.document.segments.find(s => s.id === segmentId)
  if (!segment || segment.text === text) return

  store.updateSegment(segmentId, { text, verified: true })
}

function cancelCaptionEdit() {
  editingSegmentId.value = null
}

function onCaptionEditorKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    cancelCaptionEdit()
    return
  }
  // Enter commits (captions are short); Shift+Enter inserts a newline.
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    commitCaptionEdit()
  }
}

// Resizable caption area (backed by store for persistence)
function startCaptionResize(event: MouseEvent) {
  event.preventDefault()
  const startY = event.clientY
  const startHeight = store.captionHeight

  function onMouseMove(e: MouseEvent) {
    const delta = startY - e.clientY
    store.captionHeight = Math.max(60, Math.min(400, startHeight + delta))
  }

  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

const mediaElement = computed(() => videoElement.value || audioElement.value)
const hasMedia = computed(() => !!store.mediaPath)
const isVideo = computed(() => {
  // Determine if media is video or audio based on file extension
  if (!store.mediaPath) return false
  const path = store.mediaPath.toLowerCase()
  return path.includes('.mp4') || path.includes('.webm') || path.includes('.mov') || path.includes('.avi')
})

const mediaFileName = computed(() => {
  // Display exactly what will be saved in document metadata (document.metadata.mediaFilePath)
  // This is typically a relative path (e.g., just filename) when media is in same dir as the captions file
  if (store.mediaFilePath) return store.mediaFilePath
  if (!store.mediaPath) return ''
  // Fallback: extract filename from media URL path if metadata not available
  const path = store.mediaPath
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1]
})

const currentCaptionText = computed(() => {
  const seg = store.currentSegment
  return seg ? seg.text : ''
})

/**
 * Click a timed word to move the playhead to it — the same gesture the table offers on a row or
 * a time cell (`CaptionTable.onRowClicked` / the start-time column's `onCellClicked`).
 *
 * `event.detail > 1` is skipped so the second click of a double-click (which opens the editor)
 * does not also seek; the first click still lands, matching the table's time cells.
 */
function onCaptionWordClick(event: MouseEvent) {
  if (event.detail > 1) return

  const target = event.target as HTMLElement | null
  if (!target?.classList.contains('word-span')) return

  const wordIndexStr = target.dataset.wordIndex
  if (wordIndexStr === undefined) return

  const word = currentSegment.value?.words?.[parseInt(wordIndexStr, 10)]
  // Words added or changed by editing carry no timestamp — nothing to seek to.
  if (!word || word.startTime === undefined) return

  console.log('Seeking to word:', word.text, 'at', word.startTime)
  seekTo(word.startTime)
}

/**
 * Seek both the store and the media element.
 *
 * The `store.currentTime` watcher only re-syncs the element when they differ by >0.5s (to avoid
 * fighting `timeupdate`), so short hops need the element set explicitly — same as the table does.
 */
function seekTo(time: number) {
  if (mediaElement.value) {
    mediaElement.value.currentTime = time
  }
  store.setCurrentTime(time)
}

/**
 * Playback speed.
 *
 * Lives in `uiState` (see `captionStore.playbackRate`), so the speed that suits a particular
 * recording comes back with it — and, being view state, changing it never raises the
 * unsaved-changes prompt.
 *
 * `playbackRate` is per-element and resets to `defaultPlaybackRate` whenever a new source loads,
 * and switching between the <video> and <audio> branch mounts a *fresh* element — so the rate has
 * to be re-applied on `loadedmetadata` (`onMediaLoaded`), not just when the user picks a value.
 * Setting `defaultPlaybackRate` too means an in-flight source swap resets to the chosen speed
 * rather than to 1x.
 */
function applyPlaybackRate() {
  const el = mediaElement.value
  if (!el) return
  const rate = store.playbackRate
  el.defaultPlaybackRate = rate
  if (el.playbackRate !== rate) el.playbackRate = rate
}

/**
 * Adopt a rate the *element* changed on its own.
 *
 * The `controls` overlay Chromium draws has its own playback-speed submenu (behind the ⋮
 * button), and it writes `playbackRate` directly. Without this the audio would run at the speed
 * picked there while our <select> still read 1x and nothing was persisted to the document.
 *
 * Snapping keeps one source of truth; the `!==` guard stops the round trip with
 * `applyPlaybackRate()` (which fires `ratechange` itself) from looping.
 */
function onMediaRateChange() {
  const el = mediaElement.value
  if (!el) return
  const snapped = nearestPlaybackRate(el.playbackRate)
  if (snapped === store.playbackRate) return
  console.log('Adopting playback rate changed on the media element:', el.playbackRate, '->', snapped)
  store.playbackRate = snapped
}

function onPlaybackRateChange(event: Event) {
  const rate = parseFloat((event.target as HTMLSelectElement).value)
  if (!Number.isFinite(rate)) return
  console.log('Setting playback rate to', rate)
  store.playbackRate = rate
}

/** "1x", "1.25x" — trailing zeros trimmed so the control stays narrow. */
function formatRate(rate: number): string {
  return `${parseFloat(rate.toFixed(2))}x`
}

watch(() => store.playbackRate, applyPlaybackRate)

function onCaptionContextMenu(event: MouseEvent) {
  event.preventDefault()

  const target = event.target as HTMLElement

  // Check if the clicked element is a word span
  if (target.classList.contains('word-span')) {
    const wordIndexStr = target.dataset.wordIndex
    const hasTimestamp = target.dataset.hasTimestamp === 'true'

    if (!wordIndexStr) return

    const wordIndex = parseInt(wordIndexStr, 10)
    const segment = currentSegment.value

    if (!segment) return

    // Build context menu items
    const items: ContextMenuItem[] = []

    if (hasTimestamp && wordIndex > 0) {
      // Can split at this word
      items.push({
        label: 'Split segment starting here',
        action: () => {
          console.log('Splitting segment', segment.id, 'at word index', wordIndex)
          store.splitSegmentAtWordIndex(segment.id, wordIndex)
        }
      })
    } else {
      // Cannot split - show disabled item with reason
      let reason = ''
      if (wordIndex === 0) {
        reason = '(cannot split before first word)'
      } else if (!hasTimestamp) {
        reason = '(word has no timestamp)'
      }

      items.push({
        label: `Split segment starting here ${reason}`,
        action: () => {},
        disabled: true
      })
    }

    contextMenuItems.value = items
    contextMenuPosition.value = { x: event.clientX, y: event.clientY }
    isContextMenuVisible.value = true
  }
}

function onMediaLoaded() {
  if (!mediaElement.value) return
  duration.value = mediaElement.value.duration
  console.log('Media loaded, duration:', duration.value)

  // A freshly loaded source is always back at 1x — restore the chosen speed before anything plays.
  applyPlaybackRate()

  // Restore the persisted playhead. This is the earliest point at which the element
  // will accept a seek — the `store.currentTime` watcher below fires while the element
  // is still empty and its seek is silently dropped. Never starts playback.
  const target = store.currentTime
  if (target > 0 && Number.isFinite(duration.value) && target < duration.value) {
    console.log('Restoring playhead to', target)
    mediaElement.value.currentTime = target
  }
}

function onTimeUpdate() {
  if (mediaElement.value) {
    store.setCurrentTime(mediaElement.value.currentTime)

    // SEGMENTS_PLAYING mode: Check if we should advance to next segment
    if (segmentEndTime.value !== null && mediaElement.value.currentTime >= segmentEndTime.value) {
      console.log('Segment playback complete')

      // `timelineSilence` = next segment start minus previous end (negative if backward jump).
      // Only skip the seek when the next segment is slightly ahead (0 to threshold);
      // always seek for backward jumps (negative) or large forward gaps.
      const prevEnd = segmentEndTime.value
      const mediaT = mediaElement.value.currentTime
      const nextIndex = store.playlistIndex + 1
      const nextId = store.playlist[nextIndex]
      const nextSeg = nextId
        ? store.document.segments.find((s) => s.id === nextId)
        : undefined
      const timelineSilence =
        nextSeg !== undefined ? nextSeg.startTime - prevEnd : Number.POSITIVE_INFINITY
      const seekToNextStart =
        timelineSilence < 0 || timelineSilence > SEQUENTIAL_PLAYBACK_GAP_SEEK_THRESHOLD_SEC

      const hasNext = store.nextPlaylistSegment(seekToNextStart ? undefined : mediaT)
      if (hasNext) {
        const nextSegment = store.currentPlaylistSegment
        if (nextSegment) {
          console.log('Playlist: moving to next segment:', nextSegment.id)
          segmentEndTime.value = nextSegment.endTime
          if (seekToNextStart) {
            mediaElement.value.currentTime = nextSegment.startTime
          }
          // Keep playing (don't pause)
        }
      } else {
        // Reached end of playlist - stopPlaylistPlayback will handle returning to start
        console.log('Playlist: reached end of playlist')
        mediaElement.value.pause()
        segmentEndTime.value = null
      }
    }
  }
}

function onPlay() {
  // If starting from STOPPED mode, enter MEDIA_PLAYING mode
  if (store.playbackMode === PlaybackMode.STOPPED) {
    store.playbackMode = PlaybackMode.MEDIA_PLAYING
  }
  store.setPlaying(true)
}

function onPause() {
  // Pausing always returns to STOPPED mode
  if (store.playbackMode === PlaybackMode.SEGMENTS_PLAYING) {
    console.log('Pause detected - stopping playlist playback')
    store.stopPlaylistPlayback(false)  // Don't return to start on manual pause
    segmentEndTime.value = null
  } else {
    // From MEDIA_PLAYING, go back to STOPPED
    store.playbackMode = PlaybackMode.STOPPED
  }
  store.setPlaying(false)
}

function togglePlayPause() {
  if (!mediaElement.value) return

  if (store.isPlaying) {
    console.log('Pausing playback')
    mediaElement.value.pause()
  } else {
    console.log('Starting playback')
    mediaElement.value.play()
  }
}

function onScrub(event: Event) {
  const target = event.target as HTMLInputElement
  const time = parseFloat(target.value)
  console.log('Manual scrub to:', time)

  // Mark as manual scrub
  isManualScrub.value = true

  // SEGMENTS_PLAYING mode: Manual scrubbing cancels playlist playback
  if (store.playbackMode === PlaybackMode.SEGMENTS_PLAYING) {
    console.log('Manual scrub detected - canceling playlist playback')
    store.cancelPlaylistPlayback()
    segmentEndTime.value = null
  }

  if (mediaElement.value) {
    mediaElement.value.currentTime = time
    store.setCurrentTime(time)
  }

  // Reset flag after a short delay
  setTimeout(() => {
    isManualScrub.value = false
  }, 100)
}

function showMediaInFinder() {
  if (store.mediaFilePath) {
    window.electronAPI?.showInFolder(store.mediaFilePath)
  }
}

function formatTime(seconds: number): string {
  // Use simple seconds format (ssss.000)
  return seconds.toFixed(3)
}

// Watch for play/pause from store (triggered by action buttons)
watch(() => store.isPlaying, (playing) => {
  if (!mediaElement.value) return

  if (playing) {
    // SEGMENTS_PLAYING mode: Set up segment end time for playlist playback
    if (store.playbackMode === PlaybackMode.SEGMENTS_PLAYING) {
      const currentSegment = store.currentPlaylistSegment
      if (currentSegment) {
        console.log('SEGMENTS_PLAYING: Starting playlist playback for segment:', currentSegment.id)
        segmentEndTime.value = currentSegment.endTime
      }
    } else {
      // MEDIA_PLAYING mode: Normal playback, no segment tracking
      console.log('MEDIA_PLAYING: Starting normal media playback')
      segmentEndTime.value = null
    }

    if (mediaElement.value.paused) {
      mediaElement.value.play().catch(err => {
        console.error('Failed to play:', err)
      })
    }
  } else if (!playing) {
    if (!mediaElement.value.paused) {
      mediaElement.value.pause()
    }
  }
})

// Watch for time changes from store (triggered by seek buttons)
watch(() => store.currentTime, (time) => {
  if (mediaElement.value && Math.abs(mediaElement.value.currentTime - time) > 0.5) {
    console.log('Syncing media time to store:', time)
    mediaElement.value.currentTime = time
  }

  // FIX: Explicitly update the scrubber's value property to ensure visual update
  // The :value binding only sets the initial DOM attribute, not the live value property
  if (scrubberElement.value) {
    scrubberElement.value.value = time.toString()
  }
})
</script>

<style scoped>
.media-player {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 10px;
}

.media-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--surface-1);
  border: 1px solid var(--border-1);
  border-radius: 6px;
  margin-bottom: 8px;
  font-size: 13px;
}

.media-filename {
  font-weight: 500;
  color: var(--text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  margin-right: 16px;
  font-size: 13px;
}

.show-in-finder-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  font-size: 14px;
  opacity: 0.7;
  transition: opacity 0.2s;
  position: relative;
}

.show-in-finder-btn:hover {
  opacity: 1;
}

.media-duration {
  font-family: monospace;
  color: var(--text-2);
  white-space: nowrap;
}

.video-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 20px;
}

video, audio {
  max-width: 100%;
  max-height: 100%;
}

.no-media {
  text-align: center;
  color: var(--text-3);
  padding: 40px;
}

.no-media p {
  font-size: 18px;
  margin: 10px 0;
}

.hint {
  font-size: 14px !important;
  color: var(--text-2) !important;
}

.controls {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.playback-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.control-btn {
  flex-shrink: 0;
  padding: 12px 20px;
  font-size: 20px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
}

.control-btn:hover:not(:disabled) {
  background: #2980b9;
}

.control-btn:disabled {
  background: var(--btn-disabled-bg);
  cursor: not-allowed;
}

.time-display {
  font-family: monospace;
  font-size: 16px;
  min-width: 90px;
  flex-shrink: 0;
  color: var(--text-1);
}

.scrubber {
  flex: 1;
  /* Flex items default to `min-width: auto`, so the range input refuses to shrink below its
     intrinsic width and pushes the speed selector off the right edge in a narrow panel. */
  min-width: 0;
  height: 6px;
  cursor: pointer;
}

.speed-control {
  display: flex;
  align-items: center;
  position: relative;
  flex-shrink: 0;
}

.speed-select {
  font-family: monospace;
  font-size: 14px;
  padding: 6px 8px;
  color: var(--text-1);
  background: var(--surface-1);
  border: 1px solid var(--border-1);
  border-radius: 6px;
  cursor: pointer;
}

.speed-select:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.caption-resizer {
  height: 6px;
  cursor: ns-resize;
  background: var(--border-1);
  border-radius: 3px;
  transition: background 0.2s;
  flex-shrink: 0;
}

.caption-resizer:hover {
  background: var(--text-3);
}

.current-caption-display {
  display: flex;
  flex-direction: column;
  padding: 16px;
  background: var(--surface-1);
  border: 1px solid var(--border-1);
  border-radius: 6px;
  /* Scrolling moved to .caption-text so the label stays put and the text fills the box —
     which is what makes "double-click anywhere in the box to edit" hit a sensible target. */
  overflow: hidden;
  flex-shrink: 0;
}

.caption-label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  color: var(--text-2);
  margin-bottom: 8px;
  letter-spacing: 0.5px;
}

.caption-hint {
  font-weight: 400;
  text-transform: none;
  letter-spacing: normal;
  color: var(--text-3);
  white-space: nowrap;
}

.caption-editor {
  width: 100%;
  flex: 1;
  min-height: 0;
  box-sizing: border-box;
  padding: 6px 8px;
  font-family: inherit;
  font-size: 16px;
  line-height: 1.5;
  color: var(--text-1);
  background: var(--surface-popover, var(--surface-1));
  border: 1px solid #3a7afe;
  border-radius: 4px;
  resize: none;
}

.caption-editor:focus {
  outline: none;
  box-shadow: 0 0 0 2px rgba(58, 122, 254, 0.25);
}

/*
 * Current caption when `segment.words` is present: each word is an inline <span.word-span>
 * with a literal space text node between spans (see template). You would expect wrapping
 * only at those spaces.
 *
 * Problem: this container used to set overflow-wrap: break-word without per-word nowrap.
 * break-word tells the engine it may insert soft wrap opportunities *inside* a “word”
 * (Unicode line-breaking rules) when a line would otherwise overflow. Our timed tokens are
 * short Latin words, but the line breaker could still split inside them (e.g. "m" + "oment",
 * "actuall" + "y") depending on available width and how inline boxes are measured—not
 * because the DOM used divs, but because wrap opportunities were allowed inside each span’s
 * text.
 *
 * Fix: white-space: nowrap on .word-span makes each timed token a non-breaking inline run,
 * so the only break points between tokens are the explicit spaces in the markup. Keep
 * overflow-wrap: break-word on .caption-text for the v-else branch (plain segment text
 * without per-word spans), where long unbroken strings should still wrap instead of
 * overflowing horizontally. word-break: normal avoids CJK-oriented keep-all and matches
 * ordinary English wrapping for that fallback.
 *
 * Tradeoff: a single token longer than the caption box width cannot split across lines;
 * it overflows (rare for real captions; ASR tokens are usually short).
 */
.caption-text {
  flex: 1;
  overflow-y: auto;
  cursor: text;
  font-size: 16px;
  line-height: 1.5;
  color: var(--text-1);
  white-space: normal;
  overflow-wrap: break-word;
  word-break: normal;
}

.word-span {
  white-space: nowrap;
  /* Timed words are clickable (seek); untimed ones are not — see the override below. */
  cursor: pointer;
  padding: 1px 2px;
  border-radius: 2px;
  transition: background 0.15s;
}

.word-span.word-active {
  background-color: rgba(66, 133, 244, 0.35);
}

.word-span:hover {
  background: rgba(52, 152, 219, 0.15);
}

.word-span[data-has-timestamp="false"] {
  color: var(--text-3);
  font-style: italic;
  cursor: text;
}

.caption-controls {
  display: flex;
  gap: 12px;
}
</style>
