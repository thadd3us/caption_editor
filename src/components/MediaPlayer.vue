<template>
  <div class="media-player">
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
          type="range"
          class="scrubber"
          :value="store.currentTime"
          :max="duration"
          :disabled="!hasMedia"
          @input="onScrub"
        />
        <span class="time-display">{{ formatTime(duration) }}</span>
      </div>

      <div class="jump-controls">
        <button @click="jump(-60)" class="jump-btn" :disabled="!hasMedia">-60s</button>
        <button @click="jump(-30)" class="jump-btn" :disabled="!hasMedia">-30s</button>
        <button @click="jump(-5)" class="jump-btn" :disabled="!hasMedia">-5s</button>
        <button @click="jump(-1)" class="jump-btn" :disabled="!hasMedia">-1s</button>
        <button @click="jump(1)" class="jump-btn" :disabled="!hasMedia">+1s</button>
        <button @click="jump(5)" class="jump-btn" :disabled="!hasMedia">+5s</button>
        <button @click="jump(30)" class="jump-btn" :disabled="!hasMedia">+30s</button>
        <button @click="jump(60)" class="jump-btn" :disabled="!hasMedia">+60s</button>
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

const store = useVTTStore()
const videoElement = ref<HTMLVideoElement | null>(null)
const audioElement = ref<HTMLAudioElement | null>(null)
const duration = ref(0)
const snippetEndTime = ref<number | null>(null)

const mediaElement = computed(() => videoElement.value || audioElement.value)
const hasMedia = computed(() => !!store.mediaPath)
const isVideo = computed(() => {
  // Determine if media is video or audio based on file extension
  if (!store.mediaPath) return false
  const path = store.mediaPath.toLowerCase()
  return path.includes('.mp4') || path.includes('.webm') || path.includes('.mov') || path.includes('.avi')
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
      const cue = store.sortedCues.find(c => c.endTime === snippetEndTime.value)
      if (cue) {
        mediaElement.value.currentTime = cue.startTime
        store.setCurrentTime(cue.startTime)
      }

      snippetEndTime.value = null
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

function jump(seconds: number) {
  if (!mediaElement.value) return

  const newTime = Math.max(0, Math.min(duration.value, store.currentTime + seconds))
  console.log('Jumping', seconds, 'seconds to:', newTime)

  mediaElement.value.currentTime = newTime
  store.setCurrentTime(newTime)
}

function addCaptionAtCurrentTime() {
  console.log('Adding caption at current time:', store.currentTime)
  const cueId = store.addCue(store.currentTime, 5)
  store.selectCue(cueId)
}

function jumpToCurrentRow() {
  console.log('Jumping to row at current time:', store.currentTime)
  const currentTime = store.currentTime

  // Find the cue that contains the current time, or the last cue before it
  const cueAtTime = store.sortedCues.find(cue =>
    cue.startTime <= currentTime && currentTime < cue.endTime
  )

  // If no cue contains the current time, find the last cue before it
  const targetCue = cueAtTime || store.sortedCues
    .filter(cue => cue.startTime <= currentTime)
    .sort((a, b) => b.startTime - a.startTime)[0]

  if (targetCue) {
    store.selectCue(targetCue.id)
    // Emit event to tell CaptionTable to select and scroll to this row
    window.dispatchEvent(new CustomEvent('jumpToRow', { detail: { cueId: targetCue.id } }))
  }
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Watch for play/pause from store (triggered by action buttons)
watch(() => store.isPlaying, (playing) => {
  if (!mediaElement.value) return

  if (playing && mediaElement.value.paused) {
    // Check if we need to set up snippet playback
    const currentCue = store.currentCue
    if (currentCue && store.currentTime === currentCue.startTime) {
      console.log('Starting snippet playback for cue:', currentCue.id)
      snippetEndTime.value = currentCue.endTime
    }

    mediaElement.value.play()
  } else if (!playing && !mediaElement.value.paused) {
    mediaElement.value.pause()
  }
})

// Watch for time changes from store (triggered by seek buttons)
watch(() => store.currentTime, (time) => {
  if (mediaElement.value && Math.abs(mediaElement.value.currentTime - time) > 0.5) {
    console.log('Syncing media time to store:', time)
    mediaElement.value.currentTime = time
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
  min-width: 60px;
  color: #333;
}

.scrubber {
  flex: 1;
  height: 6px;
  cursor: pointer;
}

.jump-controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.jump-btn {
  padding: 8px 12px;
  background: #ecf0f1;
  border: 1px solid #bdc3c7;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.jump-btn:hover:not(:disabled) {
  background: #d5dbdb;
  border-color: #95a5a6;
}

.jump-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
