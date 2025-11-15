<template>
  <div class="app">
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
    <RenameSpeakerDialog
      :is-open="isRenameSpeakerDialogOpen"
      @close="closeRenameSpeakerDialog"
      @rename="handleRenameSpeaker"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useVTTStore } from './stores/vttStore'
import CaptionTable from './components/CaptionTable.vue'
import MediaPlayer from './components/MediaPlayer.vue'
import FileDropZone from './components/FileDropZone.vue'
import RenameSpeakerDialog from './components/RenameSpeakerDialog.vue'
import packageJson from '../package.json'

// Log version on startup
console.log(`========================================`)
console.log(`VTT Caption Editor v${packageJson.version}`)
console.log(`Running in: ${(window as any).electronAPI?.isElectron ? 'Electron' : 'Browser'}`)
console.log(`========================================`)

const store = useVTTStore()
const leftPanelWidth = ref(60)
const fileDropZone = ref<InstanceType<typeof FileDropZone> | null>(null)
const isRenameSpeakerDialogOpen = ref(false)
let isResizing = false

// Track if we've already attempted auto-load for the current document
const attemptedAutoLoad = ref<string | null>(null)

function openRenameSpeakerDialog() {
  // Check if there are any speakers in the document
  const hasSpeakers = store.document.segments.some(
    segment => segment.speakerName && segment.speakerName.trim() !== ''
  )

  // Only open the dialog if there are speakers to rename
  if (hasSpeakers) {
    isRenameSpeakerDialogOpen.value = true
  }
}

function closeRenameSpeakerDialog() {
  isRenameSpeakerDialogOpen.value = false
}

function handleRenameSpeaker({ oldName, newName }: { oldName: string; newName: string }) {
  console.log('Renaming speaker:', oldName, '->', newName)
  store.renameSpeaker(oldName, newName)
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

      // Check if the media path is already absolute
      let resolvedMediaPath: string
      if (electronAPI.path && electronAPI.path.isAbsolute(mediaFilePath)) {
        // Path is already absolute, use it directly
        resolvedMediaPath = mediaFilePath
      } else {
        // Path is relative, resolve it relative to the VTT file directory
        if (electronAPI.path) {
          const vttDir = electronAPI.path.dirname(vttFilePath)
          resolvedMediaPath = electronAPI.path.resolve(vttDir, mediaFilePath)
        } else {
          // Fallback to manual path concatenation if path API not available
          const vttDir = vttFilePath.substring(0, Math.max(
            vttFilePath.lastIndexOf('/'),
            vttFilePath.lastIndexOf('\\')
          ))
          resolvedMediaPath = vttDir + '/' + mediaFilePath.replace(/\\/g, '/')
        }
      }

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

// Menu action handlers
async function handleMenuOpenFile() {
  fileDropZone.value?.triggerFileInput()
}

async function handleMenuSaveFile() {
  if (!window.electronAPI) {
    console.error('Electron API not available')
    return
  }

  if (!store.document.filePath) {
    console.log('No file path stored, doing Save As')
    await handleMenuSaveAs()
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

async function handleMenuSaveAs() {
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

// Also attempt auto-load on mount (for localStorage recovery)
onMounted(() => {
  setTimeout(() => {
    attemptMediaAutoLoad()
  }, 200)

  // Listen for openFiles event from CaptionTable's Open Files button
  window.addEventListener('openFiles', handleMenuOpenFile as EventListener)

  // Expose dialog functions for testing
  ;(window as any).openRenameSpeakerDialog = openRenameSpeakerDialog

  // Set up native menu IPC listeners
  if ((window as any).electronAPI) {
    const { ipcRenderer } = (window as any).electronAPI

    if (ipcRenderer) {
      ipcRenderer.on('menu-open-file', handleMenuOpenFile)
      ipcRenderer.on('menu-save-file', handleMenuSaveFile)
      ipcRenderer.on('menu-save-as', handleMenuSaveAs)
      ipcRenderer.on('menu-rename-speaker', openRenameSpeakerDialog)
      ipcRenderer.on('menu-compute-speaker-similarity', () => {
        // Dispatch custom event that CaptionTable will listen for
        window.dispatchEvent(new CustomEvent('computeSpeakerSimilarity'))
      })
      console.log('[App] ✓ Native menu IPC listeners registered')
    }
  }

  // Listen for files dropped (intercepted by main process with full paths)
  if ((window as any).electronAPI?.onFileDropped) {
    console.log('[App] ✓ electronAPI.onFileDropped is available, registering handler');
    (window as any).electronAPI.onFileDropped(async (filePaths: string[]) => {
      console.log('[App] ✓ File drop handler called!')
      console.log('[App] ✓ Received file paths:', filePaths)
      console.log('[App] ✓ Number of files:', filePaths.length)

      // Use the FileDropZone component to handle the files
      if (fileDropZone.value && (window as any).electronAPI?.processDroppedFiles) {
        console.log('[App] ✓ Calling electronAPI.processDroppedFiles')
        const results = await (window as any).electronAPI.processDroppedFiles(filePaths)
        console.log('[App] ✓ Processed dropped files, got results:', results)
        console.log('[App] ✓ Number of results:', results.length)

        // Process the results directly
        for (const result of results) {
          console.log('[App] ✓ Processing result:', result)
          if (result.type === 'vtt') {
            console.log('[App] ✓ Loading VTT file:', result.filePath)
            try {
              store.loadFromFile(result.content, result.filePath)
              console.log('[App] ✓ VTT file loaded successfully')
            } catch (err) {
              console.error('[App] ✗ Failed to load VTT file:', err)
              alert('Failed to load VTT file: ' + (err instanceof Error ? err.message : 'Unknown error'))
            }
          } else if (result.type === 'media') {
            console.log('[App] ✓ Loading media file:', result.filePath)
            try {
              store.loadMediaFile(result.url, result.filePath)
              console.log('[App] ✓ Media file loaded successfully')
            } catch (err) {
              console.error('[App] ✗ Failed to load media file:', err)
              alert('Failed to load media file: ' + (err instanceof Error ? err.message : 'Unknown error'))
            }
          }
        }
        console.log('[App] ✓ All files processed successfully')
      } else {
        console.log('[App] ✗ Cannot process files - missing fileDropZone or processDroppedFiles API')
        console.log('[App]   - fileDropZone.value:', fileDropZone.value)
        console.log('[App]   - electronAPI.processDroppedFiles:', (window as any).electronAPI?.processDroppedFiles)
      }
    })
    console.log('[App] ✓ File drop handler registered successfully')
  } else {
    console.log('[App] ✗ electronAPI.onFileDropped not available')
  }
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
