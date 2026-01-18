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
    properties: ['openFile', 'multiSelections']
  })

  if (filePaths && filePaths.length > 0) {
    const { failures } = await store.processFilePaths(filePaths)
    if (failures > 0) {
      alert(`Failed to load ${failures} file(s). Check console for details.`)
    }
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
  // Handled by preload script which emits files-dropped IPC event
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
  pointer-events: all;
  z-index: 10;
}
</style>
