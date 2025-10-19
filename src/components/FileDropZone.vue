<template>
  <div
    v-if="showDropZone"
    class="drop-zone-overlay"
    @drop.prevent="handleDrop"
    @dragover.prevent="handleDragOver"
    @dragleave="handleDragLeave"
  >
    <div class="drop-zone-content">
      <div class="drop-icon">📁</div>
      <p>Drop VTT or media files here</p>
      <p class="drop-hint">You can drop both at the same time</p>
    </div>
  </div>
  <div
    v-else
    class="file-input-zone"
    @drop.prevent="handleDrop"
    @dragenter.prevent="showDropZone = true"
  >
    <input
      ref="fileInput"
      type="file"
      accept=".vtt,video/*,audio/*"
      multiple
      style="display: none"
      @change="handleFileSelect"
    />
    <button @click="triggerFileInput" class="upload-button">
      📁 Open Files
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useVTTStore } from '../stores/vttStore'

const store = useVTTStore()
const showDropZone = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

function triggerFileInput() {
  fileInput.value?.click()
}

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files) {
    processFiles(Array.from(target.files))
  }
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
  showDropZone.value = true
}

function handleDragLeave(e: DragEvent) {
  if (e.target === e.currentTarget) {
    showDropZone.value = false
  }
}

async function handleDrop(e: DragEvent) {
  console.log('Files dropped')
  showDropZone.value = false

  if (!e.dataTransfer?.files) return

  const files = Array.from(e.dataTransfer.files)
  await processFiles(files)
}

async function processFiles(files: File[]) {
  console.log('Processing', files.length, 'files')

  let vttFile: File | null = null
  let mediaFile: File | null = null

  for (const file of files) {
    if (file.name.endsWith('.vtt')) {
      vttFile = file
      console.log('Found VTT file:', file.name)
    } else if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
      mediaFile = file
      console.log('Found media file:', file.name)
    }
  }

  // Load VTT file
  if (vttFile) {
    try {
      const content = await vttFile.text()
      store.loadFromFile(content, vttFile.name)
      console.log('VTT file loaded successfully')
    } catch (err) {
      console.error('Failed to load VTT file:', err)
      alert('Failed to load VTT file: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  // Load media file
  if (mediaFile) {
    try {
      const url = URL.createObjectURL(mediaFile)
      store.loadMediaFile(url)
      console.log('Media file loaded successfully')
    } catch (err) {
      console.error('Failed to load media file:', err)
      alert('Failed to load media file: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  // If no VTT file but there's a media file, create empty document
  if (!vttFile && mediaFile) {
    console.log('No VTT file, creating empty document')
  }
}
</script>

<style scoped>
.drop-zone-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.drop-zone-content {
  background: white;
  padding: 60px;
  border-radius: 12px;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
}

.drop-icon {
  font-size: 64px;
  margin-bottom: 20px;
}

.drop-zone-content p {
  font-size: 20px;
  color: #333;
  margin: 10px 0;
}

.drop-hint {
  font-size: 14px !important;
  color: #666 !important;
}

.file-input-zone {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 100;
}

.upload-button {
  padding: 12px 24px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
  box-shadow: 0 4px 12px rgba(52, 152, 219, 0.3);
  transition: all 0.2s;
}

.upload-button:hover {
  background: #2980b9;
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(52, 152, 219, 0.4);
}
</style>
