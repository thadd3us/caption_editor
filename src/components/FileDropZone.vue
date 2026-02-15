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
      <p>Drop captions, SRT, or media files here</p>
      <p class="drop-hint">You can drop both at the same time</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useCaptionStore } from '../stores/captionStore'

const store = useCaptionStore()
const showDropZone = ref(false)

// Use a counter to handle dragenter/dragleave correctly for nested elements
let dragCounter = 0

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
      if ((window as any).showAlert) {
        await (window as any).showAlert({
          title: 'File Load Partial Failure',
          message: `Failed to load ${failures} file(s). Check console for details.`
        })
      } else {
        alert(`Failed to load ${failures} file(s). Check console for details.`)
      }
    }
  }
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  // Ensure dropEffect is set correctly
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy'
  }
}

function handleDragLeave(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  
  // Only hide if we've actually left the overlay
  if (e.target === e.currentTarget) {
    showDropZone.value = false
    dragCounter = 0
  }
}

async function handleDrop(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  showDropZone.value = false
  dragCounter = 0
  // Note: The actual drop logic is often handled by the main process 
  // listening for 'files-dropped' but in browser mode or specific setups 
  // you might want to handle it here. In our Electron app, we have a 
  // listener in App.vue for 'files-dropped'.
}

/**
 * Window-level event handlers to show drop zone
 */
function handleWindowDragEnter(e: DragEvent) {
  e.preventDefault()
  dragCounter++
  if (dragCounter === 1) {
    showDropZone.value = true
  }
}

function handleWindowDragLeave(e: DragEvent) {
  e.preventDefault()
  dragCounter--
  if (dragCounter <= 0) {
    showDropZone.value = false
    dragCounter = 0
  }
}

function handleWindowDragOver(e: DragEvent) {
  e.preventDefault()
}

function handleWindowDrop(e: DragEvent) {
  // If we drop anywhere on the window, hide the overlay
  // The overlay itself has its own handleDrop for when dropped specifically on it
  e.preventDefault()
  showDropZone.value = false
  dragCounter = 0
}

onMounted(() => {
  window.addEventListener('dragenter', handleWindowDragEnter)
  window.addEventListener('dragleave', handleWindowDragLeave)
  window.addEventListener('dragover', handleWindowDragOver)
  window.addEventListener('drop', handleWindowDrop)
})

onUnmounted(() => {
  window.removeEventListener('dragenter', handleWindowDragEnter)
  window.removeEventListener('dragleave', handleWindowDragLeave)
  window.removeEventListener('dragover', handleWindowDragOver)
  window.removeEventListener('drop', handleWindowDrop)
})

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
  pointer-events: auto; /* Ensure it catches clicks when visible */
}

.drop-zone-content {
  background: white;
  padding: 60px;
  border-radius: 12px;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  pointer-events: auto;
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
</style>
