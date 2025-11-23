<template>
  <div class="media-player">
    <div v-if="hasMedia && mediaFileName" class="media-info">
      <span class="media-filename">📁 {{ mediaFileName }}</span>
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
        controls
      />
      <div v-else class="no-media">
        <p>No media loaded</p>
        <p class="hint">Drop a video or audio file to get started</p>
      </div>
    </div>

    <div class="controls">
      <div class="caption-controls">
        <button @click="addCaptionAtCurrentTime" class="add-caption-btn" :disabled="!hasMedia">
          ➕ Add Caption at Current Position
        </button>
      </div>

      <div class="playback-controls">
        <button @click="togglePlayPause" class="control-btn" :disabled="!hasMedia">
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
      </div>

      <div class="current-caption-display">
        <div class="caption-label">Current Caption:</div>
        <div
          class="caption-text"
          @contextmenu="onCaptionContextMenu"
        >
          <template v-if="currentCue && currentCue.words && currentCue.words.length > 0">
            <span
              v-for="(word, index) in currentCue.words"
              :key="index"
              class="word-span"
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
import { ref, computed, watch } from 'vue'
import { useVTTStore, PlaybackMode } from '../stores/vttStore'
import ContextMenu from './ContextMenu.vue'
import type { ContextMenuItem } from './ContextMenu.types'

const store = useVTTStore()
const videoElement = ref<HTMLVideoElement | null>(null)
const audioElement = ref<HTMLAudioElement | null>(null)
const duration = ref(0)
const segmentEndTime = ref<number | null>(null)  // Track when current segment should end
const scrubberElement = ref<HTMLInputElement | null>(null)
const isManualScrub = ref(false)  // Track if user is manually scrubbing

// Context menu state
const isContextMenuVisible = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const contextMenuItems = ref<ContextMenuItem[]>([])
const currentCue = computed(() => store.currentCue)

const mediaElement = computed(() => videoElement.value || audioElement.value)
const hasMedia = computed(() => !!store.mediaPath)
const isVideo = computed(() => {
  // Determine if media is video or audio based on file extension
  if (!store.mediaPath) return false
  const path = store.mediaPath.toLowerCase()
  return path.includes('.mp4') || path.includes('.webm') || path.includes('.mov') || path.includes('.avi')
})

const mediaFileName = computed(() => {
  // Display exactly what will be saved in VTT metadata (document.metadata.mediaFilePath)
  // This is typically a relative path (e.g., just filename) when media is in same dir as VTT
  if (store.mediaFilePath) return store.mediaFilePath
  if (!store.mediaPath) return ''
  // Fallback: extract filename from media URL path if metadata not available
  const path = store.mediaPath
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1]
})

const currentCaptionText = computed(() => {
  const cues = store.document.segments
  const time = store.currentTime

  // Find the cue that contains the current time (startTime <= time < endTime)
  const cue = cues.find(cue =>
    cue.startTime <= time && time < cue.endTime
  )

  return cue ? cue.text : 'No caption at current time'
})

function onCaptionContextMenu(event: MouseEvent) {
  event.preventDefault()

  const target = event.target as HTMLElement

  // Check if the clicked element is a word span
  if (target.classList.contains('word-span')) {
    const wordIndexStr = target.dataset.wordIndex
    const hasTimestamp = target.dataset.hasTimestamp === 'true'

    if (!wordIndexStr) return

    const wordIndex = parseInt(wordIndexStr, 10)
    const cue = currentCue.value

    if (!cue) return

    // Build context menu items
    const items: ContextMenuItem[] = []

    if (hasTimestamp && wordIndex > 0) {
      // Can split at this word
      items.push({
        label: 'Split segment starting here',
        action: () => {
          console.log('Splitting segment', cue.id, 'at word index', wordIndex)
          store.splitSegmentAtWordIndex(cue.id, wordIndex)
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
  if (mediaElement.value) {
    duration.value = mediaElement.value.duration
    console.log('Media loaded, duration:', duration.value)
  }
}

function onTimeUpdate() {
  if (mediaElement.value) {
    store.setCurrentTime(mediaElement.value.currentTime)

    // SEGMENTS_PLAYING mode: Check if we should advance to next segment
    if (segmentEndTime.value !== null && mediaElement.value.currentTime >= segmentEndTime.value) {
      console.log('Segment playback complete')

      // Move to next segment in the playlist
      const hasNext = store.nextPlaylistSegment()
      if (hasNext) {
        // Continue playing the next segment
        const nextSegment = store.currentPlaylistSegment
        if (nextSegment) {
          console.log('Playlist: moving to next segment:', nextSegment.id)
          segmentEndTime.value = nextSegment.endTime
          mediaElement.value.currentTime = nextSegment.startTime
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

function addCaptionAtCurrentTime() {
  console.log('Adding caption at current time:', store.currentTime)
  const cueId = store.addCue(store.currentTime, 5)
  store.selectCue(cueId)
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
  padding: 20px;
}

.media-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  margin-bottom: 12px;
  font-size: 14px;
}

.media-filename {
  font-weight: 500;
  color: #495057;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  margin-right: 16px;
}

.media-duration {
  font-family: monospace;
  color: #6c757d;
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
  color: #999;
  padding: 40px;
}

.no-media p {
  font-size: 18px;
  margin: 10px 0;
}

.hint {
  font-size: 14px !important;
  color: #666 !important;
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
  background: #ccc;
  cursor: not-allowed;
}

.time-display {
  font-family: monospace;
  font-size: 16px;
  min-width: 90px;
  color: #333;
}

.scrubber {
  flex: 1;
  height: 6px;
  cursor: pointer;
}

.current-caption-display {
  padding: 16px;
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  min-height: 80px;
}

.caption-label {
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  color: #6c757d;
  margin-bottom: 8px;
  letter-spacing: 0.5px;
}

.caption-text {
  font-size: 16px;
  line-height: 1.5;
  color: #212529;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.word-span {
  cursor: context-menu;
  padding: 1px 2px;
  border-radius: 2px;
  transition: background 0.15s;
}

.word-span:hover {
  background: rgba(52, 152, 219, 0.15);
}

.word-span[data-has-timestamp="false"] {
  color: #999;
  font-style: italic;
}

.caption-controls {
  display: flex;
  gap: 12px;
}

.add-caption-btn {
  padding: 12px 20px;
  background: #27ae60;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.2s;
}

.add-caption-btn:hover:not(:disabled) {
  background: #229954;
}

.add-caption-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}
</style>
