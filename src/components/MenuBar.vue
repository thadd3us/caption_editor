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
            <div class="dropdown-divider"></div>
            <button @click="clearAll" class="dropdown-item">
              Clear
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="menu-actions">
      <button @click="openFile" class="menu-button open-button">
        📁 Open Files
      </button>
      <button @click="exportVTT" class="menu-button">
        Export VTT
      </button>
      <button @click="clearAll" class="menu-button">
        Clear
      </button>
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

  if (modifier && event.key === 's') {
    event.preventDefault()
    if (store.document.filePath) {
      saveFile()
    } else {
      exportVTT()
    }
  } else if (modifier && event.key === 'o') {
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

// Save to existing file
async function saveFile() {
  closeFileMenu()

  if (!store.document.filePath) {
    // No file path, do Save As instead
    await exportVTT()
    return
  }

  console.log('Saving VTT file to:', store.document.filePath)
  try {
    const content = store.exportToString()

    // Use Electron save to existing file if available
    if (window.electronAPI) {
      const result = await window.electronAPI.saveExistingFile({
        filePath: store.document.filePath,
        content
      })

      if (result.success) {
        console.log('VTT file saved successfully:', result.filePath)
      } else {
        console.error('Failed to save VTT:', result.error)
        alert('Failed to save VTT file: ' + result.error)
      }
    } else {
      // In browser, we can't save to existing file, do Save As
      await exportVTT()
    }
  } catch (err) {
    console.error('Failed to save VTT:', err)
    alert('Failed to save VTT file: ' + (err instanceof Error ? err.message : 'Unknown error'))
  }
}

// Save As / Export
async function exportVTT() {
  closeFileMenu()
  console.log('Exporting VTT file')
  try {
    const content = store.exportToString()

    // Use Electron save dialog if available
    if (window.electronAPI) {
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
    } else {
      // Fallback to browser download
      const blob = new Blob([content], { type: 'text/vtt' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = store.document.filePath || 'captions.vtt'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      console.log('VTT file downloaded')
    }
  } catch (err) {
    console.error('Failed to export VTT:', err)
    alert('Failed to export VTT file: ' + (err instanceof Error ? err.message : 'Unknown error'))
  }
}

function clearAll() {
  closeFileMenu()
  if (confirm('Are you sure you want to clear the current document? This cannot be undone.')) {
    console.log('Clearing all data')
    store.clearDocument()
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

.open-button {
  background: #27ae60;
}

.open-button:hover {
  background: #229954;
}
</style>
