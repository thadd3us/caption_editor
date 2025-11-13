<template>
  <div class="media-player">
    <div v-if="hasMedia && mediaFileName" class="media-info">
      <span class="media-filename">📁 {{ mediaFileName }}</span>
      <span class="media-duration">⏱️ {{ formatTime(duration) }}</span>
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
        <div class="caption-text">{{ currentCaptionText }}</div>
      </div>

      <div class="caption-controls">
        <button @click="addCaptionAtCurrentTime" class="add-caption-btn" :disabled="!hasMedia">
          ➕ Add Caption at Current Position
        </button>
        <button @click="jumpToCurrentRow" class="jump-to-row-btn" :disabled="!hasMedia">
          🎯 Jump to Row
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useVTTStore } from '../stores/vttStore'
import { findIndexOfRowForTime } from '../utils/vttParser'

const store = useVTTStore()
const videoElement = ref<HTMLVideoElement | null>(null)
const audioElement = ref<HTMLAudioElement | null>(null)
const duration = ref(0)
const snippetEndTime = ref<number | null>(null)
const scrubberElement = ref<HTMLInputElement | null>(null)

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
  const cues = store.document.cues
  const time = store.currentTime

  // Find the cue that contains the current time (startTime <= time < endTime)
  const currentCue = cues.find(cue =>
    cue.startTime <= time && time < cue.endTime
  )

  return currentCue ? currentCue.text : 'No caption at current time'
})

function onMediaLoaded() {
  if (mediaElement.value) {
    duration.value = mediaElement.value.duration
    console.log('Media loaded, duration:', duration.value)
  }
}

function onTimeUpdate() {
  if (mediaElement.value) {
    store.setCurrentTime(mediaElement.value.currentTime)

    // Check if we should stop (snippet playback)
    if (snippetEndTime.value !== null && mediaElement.value.currentTime >= snippetEndTime.value) {
      console.log('Snippet playback complete, pausing')
      mediaElement.value.pause()

      // Seek back to start of snippet
      const cue = store.document.cues.find(c => c.endTime === snippetEndTime.value)
      if (cue) {
        mediaElement.value.currentTime = cue.startTime
        store.setCurrentTime(cue.startTime)
      }

      snippetEndTime.value = null
      store.setSnippetMode(false)
    }
  }
}

function onPlay() {
  store.setPlaying(true)
}

function onPause() {
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
  console.log('Scrubbing to:', time)

  if (mediaElement.value) {
    mediaElement.value.currentTime = time
    store.setCurrentTime(time)
  }
}

function addCaptionAtCurrentTime() {
  console.log('Adding caption at current time:', store.currentTime)
  const cueId = store.addCue(store.currentTime, 5)
  store.selectCue(cueId)
}

function jumpToCurrentRow() {
  const currentTime = store.currentTime
  const cues = store.document.cues

  const index = findIndexOfRowForTime(cues, currentTime)
  if (index !== -1) {
    const targetCue = cues[index]
    console.log('Jumping to row at time:', currentTime, '-> cue:', targetCue.id)
    store.selectCue(targetCue.id)
    // Emit event to tell CaptionTable to select and scroll to this row
    window.dispatchEvent(new CustomEvent('jumpToRow', { detail: { cueId: targetCue.id } }))
  }
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 1000)

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
  }
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
}

// Watch for play/pause from store (triggered by action buttons)
watch(() => store.isPlaying, (playing) => {
  if (!mediaElement.value) return

  if (playing) {
    // Only set up snippet playback if snippetMode is enabled
    if (store.snippetMode && store.selectedCueId) {
      const selectedCue = store.document.cues.find(c => c.id === store.selectedCueId)

      if (selectedCue) {
        const timeDiff = Math.abs(store.currentTime - selectedCue.startTime)

        if (timeDiff < 0.1) {
          console.log('Starting snippet playback for cue:', selectedCue.id)
          snippetEndTime.value = selectedCue.endTime
        }
      }
    } else {
      // Continuous playback mode - clear any snippet end time
      snippetEndTime.value = null
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

.jump-to-row-btn {
  padding: 12px 20px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.2s;
}

.jump-to-row-btn:hover:not(:disabled) {
  background: #2980b9;
}

.jump-to-row-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}
</style>
