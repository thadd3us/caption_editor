<template>
  <div class="action-buttons">
    <button @click="playSnippet" class="action-btn" title="Play snippet">
      ▶️
    </button>
    <button @click="seekToStart" class="action-btn" title="Seek to start">
      ⏮️
    </button>
    <button @click="deleteCaption" class="action-btn delete-btn" title="Delete caption">
      🗑️
    </button>
  </div>
</template>

<script setup lang="ts">
import { useVTTStore } from '../stores/vttStore'

interface Props {
  data: {
    id: string
    startTime: number
    endTime: number
  }
}

const props = defineProps<Props>()
const store = useVTTStore()

function playSnippet() {
  console.log('Playing snippet:', props.data.id)
  // The MediaPlayer component will listen to this
  store.setCurrentTime(props.data.startTime)
  store.setPlaying(true)

  // Set up a listener to stop at end time
  // This will be handled by the MediaPlayer component
}

function seekToStart() {
  console.log('Seeking to start:', props.data.id)
  store.setCurrentTime(props.data.startTime)
  store.setPlaying(false)
}

function deleteCaption() {
  if (confirm('Are you sure you want to delete this caption?')) {
    console.log('Deleting caption:', props.data.id)
    store.deleteCue(props.data.id)
  }
}
</script>

<style scoped>
.action-buttons {
  display: flex;
  gap: 6px;
  padding: 4px 0;
}

.action-btn {
  padding: 4px 8px;
  border: 1px solid #ddd;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.action-btn:hover {
  background: #f0f0f0;
  border-color: #999;
}

.delete-btn:hover {
  background: #fee;
  border-color: #fcc;
}
</style>
