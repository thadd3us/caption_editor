<template>
  <div class="menu-bar">
    <div class="menu-left">
      <h1>VTT Editor</h1>
      <div class="menu-items">
        <div class="menu-dropdown">
          <button @click="toggleFileMenu" class="menu-item" ref="fileMenuButton">
            File
          </button>
          <div v-if="showFileMenu" class="dropdown-content" ref="fileMenuDropdown">
            <button @click="openFile" class="dropdown-item">
              Open File... <span class="shortcut">Ctrl+O</span>
            </button>
            <button @click="saveFile" class="dropdown-item" :disabled="!store.document.filePath">
              Save <span class="shortcut">Ctrl+S</span>
            </button>
            <button @click="exportVTT" class="dropdown-item">
              Save As...
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="menu-actions">
      <div
        class="drop-zone-button"
        @click="openFile"
        @drop.prevent="handleDrop"
        @dragover.prevent="handleDragOver"
        @dragleave="handleDragLeave"
        :class="{ 'drag-over': isDragOver }"
      >
        <button class="menu-button open-button">
          📁 Open Files
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useVTTStore } from '../stores/vttStore'

const store = useVTTStore()
const showFileMenu = ref(false)
const fileMenuButton = ref<HTMLButtonElement | null>(null)
const fileMenuDropdown = ref<HTMLDivElement | null>(null)
const isDragOver = ref(false)

// Menu state management
function toggleFileMenu() {
  showFileMenu.value = !showFileMenu.value
}

function closeFileMenu() {
  showFileMenu.value = false
}

// Click outside handler
function handleClickOutside(event: MouseEvent) {
  if (showFileMenu.value) {
    const target = event.target as Node
    if (fileMenuButton.value && !fileMenuButton.value.contains(target) &&
        fileMenuDropdown.value && !fileMenuDropdown.value.contains(target)) {
      closeFileMenu()
    }
  }
}

// Keyboard shortcuts
function handleKeyDown(event: KeyboardEvent) {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const modifier = isMac ? event.metaKey : event.ctrlKey
  const key = event.key.toLowerCase()

  if (modifier && key === 's') {
    event.preventDefault()
    console.log('Save shortcut triggered, filePath:', store.document.filePath)
    if (store.document.filePath) {
      console.log('Calling saveFile()')
      saveFile()
    } else {
      console.log('No filePath, calling exportVTT()')
      exportVTT()
    }
  } else if (modifier && key === 'o') {
    event.preventDefault()
    openFile()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleKeyDown)
})

// Emit event to trigger file picker from FileDropZone
const emit = defineEmits<{
  openFiles: []
}>()

function openFile() {
  closeFileMenu()
  emit('openFiles')
}

// Drag and drop handlers for Open Files button
function handleDragOver(event: DragEvent) {
  event.preventDefault()
  isDragOver.value = true
}

function handleDragLeave(event: DragEvent) {
  event.preventDefault()
  isDragOver.value = false
}

async function handleDrop(event: DragEvent) {
  event.preventDefault()
  isDragOver.value = false
  // Note: Actual file processing happens via the preload script's drop handler
}

// Save to existing file (Electron only)
async function saveFile() {
  closeFileMenu()

  if (!window.electronAPI) {
    console.error('Electron API not available')
    return
  }

  if (!store.document.filePath) {
    console.log('No file path stored, doing Save As')
    await exportVTT()
    return
  }

  console.log('Saving VTT file to:', store.document.filePath)
  try {
    const content = store.exportToString()

    const result = await window.electronAPI.saveExistingFile({
      filePath: store.document.filePath,
      content
    })

    if (result.success) {
      console.log('VTT file saved successfully to:', result.filePath)
      // Ensure the file path is updated in store
      if (result.filePath && result.filePath !== store.document.filePath) {
        store.updateFilePath(result.filePath)
      }
    } else {
      console.error('Failed to save VTT:', result.error)
      alert('Failed to save VTT file: ' + result.error)
    }
  } catch (err) {
    console.error('Failed to save VTT:', err)
    alert('Failed to save VTT file: ' + (err instanceof Error ? err.message : 'Unknown error'))
  }
}

// Save As / Export (Electron only)
async function exportVTT() {
  closeFileMenu()

  if (!window.electronAPI) {
    console.error('Electron API not available')
    return
  }

  console.log('Exporting VTT file')
  try {
    const content = store.exportToString()

    const result = await window.electronAPI.saveFile({
      content,
      suggestedName: store.document.filePath || 'captions.vtt'
    })

    if (result.success) {
      console.log('VTT file saved successfully:', result.filePath)
      // Update the store with the new file path
      if (result.filePath) {
        store.updateFilePath(result.filePath)
      }
    } else if (result.error !== 'Save canceled') {
      console.error('Failed to save VTT:', result.error)
      alert('Failed to save VTT file: ' + result.error)
    }
  } catch (err) {
    console.error('Failed to export VTT:', err)
    alert('Failed to export VTT file: ' + (err instanceof Error ? err.message : 'Unknown error'))
  }
}
</script>

<style scoped>
.menu-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #2c3e50;
  color: white;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.menu-left {
  display: flex;
  align-items: center;
  gap: 20px;
}

h1 {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}

.menu-items {
  display: flex;
  gap: 5px;
}

.menu-dropdown {
  position: relative;
}

.menu-item {
  padding: 8px 12px;
  background: transparent;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.2s;
}

.menu-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.dropdown-content {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: white;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  min-width: 200px;
  z-index: 1000;
  padding: 4px 0;
}

.dropdown-item {
  width: 100%;
  padding: 10px 16px;
  background: transparent;
  color: #333;
  border: none;
  text-align: left;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.1s;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dropdown-item:hover:not(:disabled) {
  background: #f0f0f0;
}

.dropdown-item:disabled {
  color: #999;
  cursor: not-allowed;
}

.dropdown-divider {
  height: 1px;
  background: #e0e0e0;
  margin: 4px 0;
}

.shortcut {
  font-size: 12px;
  color: #666;
  margin-left: 20px;
}

.menu-actions {
  display: flex;
  gap: 10px;
}

.menu-button {
  padding: 8px 16px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.2s;
}

.menu-button:hover {
  background: #2980b9;
}

.drop-zone-button {
  position: relative;
}

.drop-zone-button.drag-over {
  outline: 2px dashed #27ae60;
  outline-offset: 2px;
  border-radius: 4px;
}

.open-button {
  background: #27ae60;
}

.open-button:hover {
  background: #229954;
}
</style>
