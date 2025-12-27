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
    <BulkSetSpeakerDialog
      :is-open="isBulkSetSpeakerDialogOpen"
      :row-count="bulkSetRowCount"
      @close="closeBulkSetSpeakerDialog"
      @set-speaker="handleBulkSetSpeaker"
    />
    <ConfirmDeleteDialog
      :is-open="isDeleteConfirmDialogOpen"
      :row-count="deleteRowCount"
      @close="closeDeleteConfirmDialog"
      @confirm="handleConfirmDelete"
    />
    <ConfirmAsrDialog
      :is-visible="isAsrConfirmDialogVisible"
      @confirm="handleAsrConfirmed"
      @cancel="closeAsrConfirmDialog"
    />
    <AsrModal
      ref="asrModal"
      :is-visible="isAsrModalVisible"
      :is-running="isAsrRunning"
      :failed="asrFailed"
      @cancel="handleAsrCancel"
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
import BulkSetSpeakerDialog from './components/BulkSetSpeakerDialog.vue'
import ConfirmDeleteDialog from './components/ConfirmDeleteDialog.vue'
import ConfirmAsrDialog from './components/ConfirmAsrDialog.vue'
import AsrModal from './components/AsrModal.vue'
import packageJson from '../package.json'

// Log version on startup
console.log(`========================================`)
console.log(`VTT Caption Editor v${packageJson.version}`)
console.log(`Running in: ${(window as any).electronAPI?.isElectron ? 'Electron' : 'Browser'}`)
console.log(`========================================`)

const store = useVTTStore()

// Expose store to window for testing
;(window as any).__vttStore = store

const leftPanelWidth = ref(60)
const fileDropZone = ref<InstanceType<typeof FileDropZone> | null>(null)
const isRenameSpeakerDialogOpen = ref(false)
const isBulkSetSpeakerDialogOpen = ref(false)
const bulkSetRowCount = ref(0)
const selectedCueIdsForBulkSet = ref<string[]>([])
const isDeleteConfirmDialogOpen = ref(false)
const deleteRowCount = ref(0)
const selectedCueIdsForDelete = ref<string[]>([])
let isResizing = false

// ASR state
const isAsrConfirmDialogVisible = ref(false)
const isAsrModalVisible = ref(false)
const isAsrRunning = ref(false)
const asrFailed = ref(false)
const asrModal = ref<InstanceType<typeof AsrModal> | null>(null)
let currentAsrProcessId: string | null = null

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

function openBulkSetSpeakerDialog(event: Event) {
  const customEvent = event as CustomEvent
  const { rowCount } = customEvent.detail

  // Get the currently selected rows from CaptionTable
  // We need to get the cue IDs from the grid
  const selectedRows = (window as any).__captionTableSelectedRows || []

  bulkSetRowCount.value = rowCount
  selectedCueIdsForBulkSet.value = selectedRows.map((row: any) => row.id)
  isBulkSetSpeakerDialogOpen.value = true
}

function closeBulkSetSpeakerDialog() {
  isBulkSetSpeakerDialogOpen.value = false
  selectedCueIdsForBulkSet.value = []
  bulkSetRowCount.value = 0
}

function handleBulkSetSpeaker({ speakerName }: { speakerName: string }) {
  console.log('Bulk setting speaker to:', speakerName, 'for', selectedCueIdsForBulkSet.value.length, 'cues')
  store.bulkSetSpeaker(selectedCueIdsForBulkSet.value, speakerName)
}

function openDeleteConfirmDialog(event: Event) {
  const customEvent = event as CustomEvent
  const { rowCount } = customEvent.detail

  // Get the currently selected rows from CaptionTable
  const selectedRows = (window as any).__captionTableSelectedRows || []

  deleteRowCount.value = rowCount
  selectedCueIdsForDelete.value = selectedRows.map((row: any) => row.id)
  isDeleteConfirmDialogOpen.value = true
}

function closeDeleteConfirmDialog() {
  isDeleteConfirmDialogOpen.value = false
  selectedCueIdsForDelete.value = []
  deleteRowCount.value = 0
}

function handleConfirmDelete() {
  console.log('Deleting', selectedCueIdsForDelete.value.length, 'cues')
  store.bulkDeleteCues(selectedCueIdsForDelete.value)
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

// Watch for media path changes and update ASR menu enabled state
watch(
  () => store.mediaPath,
  (mediaPath) => {
    if ((window as any).electronAPI?.updateAsrMenuEnabled) {
      (window as any).electronAPI.updateAsrMenuEnabled(!!mediaPath)
    }
  },
  { immediate: true }
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

// ASR menu handler
function handleMenuAsrCaption() {
  console.log('[ASR] Menu item clicked')

  // Check if there are existing segments
  if (store.document.segments.length > 0) {
    // Show confirmation dialog
    isAsrConfirmDialogVisible.value = true
  } else {
    // No segments, proceed directly
    startAsrTranscription()
  }
}

function closeAsrConfirmDialog() {
  isAsrConfirmDialogVisible.value = false
}

function handleAsrConfirmed() {
  isAsrConfirmDialogVisible.value = false
  startAsrTranscription()
}

async function startAsrTranscription() {
  if (!window.electronAPI?.asr) {
    console.error('[ASR] Electron API not available')
    return
  }

  if (!store.mediaFilePath) {
    console.error('[ASR] No media file loaded')
    return
  }

  console.log('[ASR] Starting transcription for:', store.mediaFilePath)

  // Show ASR modal
  isAsrModalVisible.value = true
  isAsrRunning.value = true
  asrFailed.value = false

  try {
    // Get model override from environment variable (for testing)
    const model = (window as any).__ASR_MODEL_OVERRIDE || undefined

    if (model) {
      console.log('[ASR] Using model override:', model)
    }

    // Use chunk size of 300 seconds (5 minutes) for better handling of long audio files
    const chunkSize = 300

    // Start ASR transcription
    const result = await window.electronAPI.asr.transcribe({
      mediaFilePath: store.mediaFilePath,
      model,
      chunkSize
    })

    console.log('[ASR] Transcription completed successfully:', result.vttPath)

    // Load the generated VTT file
    const vttResult = await window.electronAPI.readFile(result.vttPath)

    if (vttResult.success && vttResult.content) {
      store.loadFromFile(vttResult.content, result.vttPath)
      console.log('[ASR] VTT file loaded successfully')
    } else {
      throw new Error('Failed to read generated VTT file: ' + vttResult.error)
    }

    // Close modal on success
    isAsrModalVisible.value = false
    isAsrRunning.value = false
    currentAsrProcessId = null
  } catch (err) {
    console.error('[ASR] Transcription failed:', err)
    asrFailed.value = true
    isAsrRunning.value = false

    // Show error in modal terminal
    if (asrModal.value) {
      asrModal.value.appendOutput('\n\n❌ Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }
}

async function handleAsrCancel() {
  console.log('[ASR] Cancel button clicked')

  if (isAsrRunning.value && currentAsrProcessId && window.electronAPI?.asr) {
    // Cancel the running process
    console.log('[ASR] Cancelling process:', currentAsrProcessId)
    await window.electronAPI.asr.cancel(currentAsrProcessId)
  }

  // Close modal
  isAsrModalVisible.value = false
  isAsrRunning.value = false
  asrFailed.value = false
  currentAsrProcessId = null
}

// Also attempt auto-load on mount (for localStorage recovery)
onMounted(() => {
  setTimeout(() => {
    attemptMediaAutoLoad()
  }, 200)

  // Listen for openBulkSetSpeakerDialog event from CaptionTable's context menu
  window.addEventListener('openBulkSetSpeakerDialog', openBulkSetSpeakerDialog as EventListener)

  // Listen for openDeleteConfirmDialog event from CaptionTable's context menu
  window.addEventListener('openDeleteConfirmDialog', openDeleteConfirmDialog as EventListener)

  // Expose dialog functions for testing
  ;(window as any).openRenameSpeakerDialog = openRenameSpeakerDialog
  ;(window as any).openBulkSetSpeakerDialog = openBulkSetSpeakerDialog
  ;(window as any).openDeleteConfirmDialog = openDeleteConfirmDialog
  ;(window as any).handleMenuAsrCaption = handleMenuAsrCaption

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
      ipcRenderer.on('menu-asr-caption', handleMenuAsrCaption)
      console.log('[App] ✓ Native menu IPC listeners registered')
    }

    // Set up ASR output listeners
    if ((window as any).electronAPI.asr) {
      (window as any).electronAPI.asr.onOutput((data: { processId: string, type: string, data: string }) => {
        console.log('[ASR] Output:', data.type, data.data)
        if (asrModal.value) {
          asrModal.value.appendOutput(data.data)
        }
      })

      (window as any).electronAPI.asr.onStarted((data: { processId: string }) => {
        console.log('[ASR] Process started:', data.processId)
        currentAsrProcessId = data.processId
      })

      console.log('[App] ✓ ASR output listeners registered')
    }
  }

  // Listen for files dropped via IPC
  if ((window as any).electronAPI?.ipcRenderer) {
    (window as any).electronAPI.ipcRenderer.on('files-dropped', async (_: any, filePaths: string[]) => {
      if ((window as any).electronAPI?.processDroppedFiles) {
        const results = await (window as any).electronAPI.processDroppedFiles(filePaths)

        for (const result of results) {
          if (result.type === 'vtt') {
            try {
              store.loadFromFile(result.content, result.filePath)
            } catch (err) {
              console.error('Failed to load VTT file:', err)
              alert('Failed to load VTT file: ' + (err instanceof Error ? err.message : 'Unknown error'))
            }
          } else if (result.type === 'media') {
            try {
              store.loadMediaFile(result.url, result.filePath)
            } catch (err) {
              console.error('Failed to load media file:', err)
              alert('Failed to load media file: ' + (err instanceof Error ? err.message : 'Unknown error'))
            }
          }
        }
      }
    })
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
