<template>
  <div class="app">
    <MenuBar @open-files="handleOpenFiles" />
    <div class="main-content">
      <div class="resizable-container">
        <div class="left-panel" :style="{ width: leftPanelWidth + '%' }">
          <CaptionTable />
        </div>
        <div class="resizer" @mousedown="startResize"></div>
        <div class="right-panel" :style="{ width: (100 - leftPanelWidth) + '%' }">
          <MediaPlayer />
        </div>
      </div>
    </div>
    <FileDropZone ref="fileDropZone" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useVTTStore } from './stores/vttStore'
import MenuBar from './components/MenuBar.vue'
import CaptionTable from './components/CaptionTable.vue'
import MediaPlayer from './components/MediaPlayer.vue'
import FileDropZone from './components/FileDropZone.vue'

const store = useVTTStore()
const leftPanelWidth = ref(60)
const fileDropZone = ref<InstanceType<typeof FileDropZone> | null>(null)
let isResizing = false

// Track if we've already attempted auto-load for the current document
const attemptedAutoLoad = ref<string | null>(null)

function handleOpenFiles() {
  fileDropZone.value?.triggerFileInput()
}

function startResize(e: MouseEvent) {
  console.log('Starting panel resize')
  isResizing = true
  e.preventDefault()

  // Get the container element
  const container = (e.target as HTMLElement).parentElement
  if (!container) return

  const onMouseMove = (moveEvent: MouseEvent) => {
    if (!isResizing) return

    // Calculate position relative to the container
    const containerRect = container.getBoundingClientRect()
    const offsetX = moveEvent.clientX - containerRect.left
    const newWidth = (offsetX / containerRect.width) * 100

    // Constrain width between 20% and 80%
    if (newWidth >= 20 && newWidth <= 80) {
      leftPanelWidth.value = newWidth
    }
  }

  const onMouseUp = () => {
    console.log('Ending panel resize')
    isResizing = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

/**
 * Attempts to automatically load media file referenced in VTT metadata
 * This works in Electron mode only - browser mode cannot access file system
 */
async function attemptMediaAutoLoad() {
  const metadata = store.document.metadata
  const mediaFilePath = metadata?.mediaFilePath
  const documentId = metadata?.id

  // Skip if no media file path in metadata
  if (!mediaFilePath) {
    console.log('[Auto-load] No mediaFilePath in VTT metadata')
    return
  }

  // Skip if we already attempted auto-load for this document
  if (attemptedAutoLoad.value === documentId) {
    console.log('[Auto-load] Already attempted for this document')
    return
  }

  // Skip if media is already loaded
  if (store.mediaPath) {
    console.log('[Auto-load] Media already loaded, skipping auto-load')
    attemptedAutoLoad.value = documentId
    return
  }

  console.log('[Auto-load] VTT metadata references media file:', mediaFilePath)

  // Mark that we've attempted auto-load for this document
  attemptedAutoLoad.value = documentId

  // Check if we're in Electron mode
  const isElectron = !!(window as any).electronAPI?.isElectron

  if (isElectron && (window as any).electronAPI && store.document.filePath) {
    try {
      const electronAPI = (window as any).electronAPI
      const vttFilePath = store.document.filePath

      // Resolve the media file path relative to the VTT file directory
      const vttDir = vttFilePath.substring(0, Math.max(
        vttFilePath.lastIndexOf('/'),
        vttFilePath.lastIndexOf('\\')
      ))
      const resolvedMediaPath = vttDir + '/' + mediaFilePath.replace(/\\/g, '/')

      console.log('[Auto-load] Attempting to load media file from:', resolvedMediaPath)

      // Check if the file exists
      const stats = await electronAPI.statFile(resolvedMediaPath)

      if (stats.success && stats.exists && stats.isFile) {
        // Convert to URL and load
        const urlResult = await electronAPI.fileToURL(resolvedMediaPath)

        if (urlResult.success && urlResult.url) {
          store.loadMediaFile(urlResult.url, resolvedMediaPath)
          console.log('[Auto-load] Successfully auto-loaded media file:', resolvedMediaPath)
        } else {
          console.warn('[Auto-load] Failed to convert media file to URL:', urlResult.error)
        }
      } else {
        console.warn('[Auto-load] Media file referenced in VTT metadata not found:', resolvedMediaPath)
      }
    } catch (err) {
      console.error('[Auto-load] Error auto-loading media file:', err)
    }
  } else {
    // In browser mode, we can't automatically load files
    console.log('[Auto-load] Browser mode: Cannot auto-load media file. Please drag and drop:', mediaFilePath)
  }
}

// Watch for document metadata changes and attempt auto-load
watch(
  () => store.document.metadata,
  () => {
    // Use nextTick to ensure DOM is updated
    setTimeout(() => {
      attemptMediaAutoLoad()
    }, 100)
  },
  { immediate: true, deep: true }
)

// Also attempt auto-load on mount (for localStorage recovery)
onMounted(() => {
  setTimeout(() => {
    attemptMediaAutoLoad()
  }, 200)
})
</script>

<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body, #app {
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.main-content {
  flex: 1;
  overflow: hidden;
}

.resizable-container {
  display: flex;
  height: 100%;
}

.left-panel {
  height: 100%;
  overflow: auto;
  background: #f5f5f5;
}

.resizer {
  width: 4px;
  background: #ddd;
  cursor: col-resize;
  flex-shrink: 0;
}

.resizer:hover {
  background: #999;
}

.right-panel {
  height: 100%;
  overflow: auto;
  background: #fff;
}
</style>
