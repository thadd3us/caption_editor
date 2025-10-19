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
import { computed } from 'vue'
import { useVTTStore } from '../stores/vttStore'

interface Props {
  params?: {
    data: {
      id: string
      startTime: number
      endTime: number
    }
  }
  data?: {
    id: string
    startTime: number
    endTime: number
  }
}

const props = defineProps<Props>()
const store = useVTTStore()

// Support both AG Grid (params.data) and direct usage (data)
const rowData = computed(() => props.params?.data || props.data)

function playSnippet() {
  if (!rowData.value) return
  console.log('Playing snippet:', rowData.value.id)
  // The MediaPlayer component will listen to this
  store.setCurrentTime(rowData.value.startTime)
  store.setPlaying(true)

  // Set up a listener to stop at end time
  // This will be handled by the MediaPlayer component
}

function seekToStart() {
  if (!rowData.value) return
  console.log('Seeking to start:', rowData.value.id)
  store.setCurrentTime(rowData.value.startTime)
  store.setPlaying(false)
}

function deleteCaption() {
  if (!rowData.value) return
  if (confirm('Are you sure you want to delete this caption?')) {
    console.log('Deleting caption:', rowData.value.id)
    store.deleteCue(rowData.value.id)
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
