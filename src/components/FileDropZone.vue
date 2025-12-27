<template>
  <!-- Electron-only drop zone overlay -->
  <div
    v-if="showDropZone"
    class="drop-zone-overlay"
    @drop="handleDrop"
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
    @drop="handleDrop"
    @dragenter.prevent="showDropZone = true"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useVTTStore } from '../stores/vttStore'

const store = useVTTStore()
const showDropZone = ref(false)

async function triggerFileInput() {
  if (!window.electronAPI) {
    console.error('Electron API not available')
    return
  }

  // Use Electron file picker
  const filePaths = await window.electronAPI.openFile({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'VTT Files', extensions: ['vtt'] },
      { name: 'Media Files', extensions: ['mp4', 'webm', 'ogg', 'mp3', 'wav', 'mov', 'm4a'] }
    ]
  })

  if (filePaths && filePaths.length > 0) {
    await processElectronFiles(filePaths)
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
  e.preventDefault()
  showDropZone.value = false
  // File processing is handled by preload script → main process → App.vue IPC listener
}

async function processElectronFiles(filePaths: string[]) {
  if (!window.electronAPI) return

  console.log('[processElectronFiles] Processing', filePaths.length, 'files via Electron:', filePaths)

  const results = await window.electronAPI.processDroppedFiles(filePaths)
  console.log('[processElectronFiles] Got results from Electron:', results)

  for (const result of results) {
    if (result.type === 'vtt' && result.content) {
      try {
        store.loadFromFile(result.content, result.filePath)
        console.log('VTT file loaded successfully:', result.fileName)
        // Note: Media auto-loading from VTT metadata is handled by App.vue watcher
      } catch (err) {
        console.error('Failed to load VTT file:', err)
        alert('Failed to load VTT file: ' + (err instanceof Error ? err.message : 'Unknown error'))
      }
    } else if (result.type === 'media' && result.url) {
      try {
        store.loadMediaFile(result.url, result.filePath)
        console.log('Media file loaded successfully:', result.fileName)
      } catch (err) {
        console.error('Failed to load media file:', err)
        alert('Failed to load media file: ' + (err instanceof Error ? err.message : 'Unknown error'))
      }
    }
  }
}

// Expose methods to parent component
defineExpose({
  triggerFileInput
})
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
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 10;
}
</style>
