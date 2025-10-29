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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useVTTStore } from '../stores/vttStore'

const store = useVTTStore()
const showDropZone = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const isElectron = ref(false)

onMounted(() => {
  isElectron.value = !!window.electronAPI?.isElectron

  // Listen for Electron file drops
  if (isElectron.value) {
    window.addEventListener('electron-files-dropped', ((event: CustomEvent<{ filePaths: string[] }>) => {
      handleElectronFileDrop(event)
    }) as EventListener)
  }
})

async function triggerFileInput() {
  if (isElectron.value && window.electronAPI) {
    // Use Electron file picker
    const filePaths = await window.electronAPI.openFile({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'VTT Files', extensions: ['vtt'] },
        { name: 'Media Files', extensions: ['mp4', 'webm', 'ogg', 'mp3', 'wav', 'mov', 'm4a'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (filePaths && filePaths.length > 0) {
      await processElectronFiles(filePaths)
    }
  } else {
    // Use browser file picker
    fileInput.value?.click()
  }
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

  // In Electron, extract file paths and use Electron API
  if (isElectron.value && window.electronAPI) {
    // @ts-ignore - path property exists in Electron
    const filePaths = files.map(f => f.path).filter(Boolean)
    if (filePaths.length > 0) {
      await processElectronFiles(filePaths)
      return
    }
  }

  // Fallback to browser processing
  await processFiles(files)
}

async function handleElectronFileDrop(event: CustomEvent<{ filePaths: string[] }>) {
  showDropZone.value = false
  await processElectronFiles(event.detail.filePaths)
}

async function processElectronFiles(filePaths: string[]) {
  if (!window.electronAPI) return

  console.log('Processing', filePaths.length, 'files via Electron')

  const results = await window.electronAPI.processDroppedFiles(filePaths)

  for (const result of results) {
    if (result.type === 'vtt' && result.content) {
      try {
        store.loadFromFile(result.content, result.filePath)
        console.log('VTT file loaded successfully:', result.fileName)
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
      // Try to get full path from File object (may be limited by browser security)
      // @ts-ignore - path property exists in Electron and some contexts
      const filePath = mediaFile.path || mediaFile.webkitRelativePath || mediaFile.name
      store.loadMediaFile(url, filePath)
      console.log('Media file loaded successfully:', filePath)
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
