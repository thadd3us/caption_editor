<template>
  <div class="menu-bar">
    <h1>VTT Editor</h1>
    <div class="menu-actions">
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
import { useVTTStore } from '../stores/vttStore'

const store = useVTTStore()

async function exportVTT() {
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
        alert('File saved successfully!')
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

h1 {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
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
</style>
