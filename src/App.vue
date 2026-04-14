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
    <RemuxMp3Dialog
      :is-visible="isRemuxMp3DialogVisible"
      @remux="handleRemuxMp3Confirmed"
      @skip="handleRemuxMp3Skipped"
    />
    <AsrModal
      ref="asrModal"
      :is-visible="isAsrModalVisible"
      :is-running="isAsrRunning"
      :failed="asrFailed"
      :title="asrModalTitle"
      @cancel="handleAsrCancel"
    />

    <!-- Generic Dialogs -->
    <GenericConfirmDialog
      :is-open="confirmState.isOpen"
      :title="confirmState.title"
      :message="confirmState.message"
      :confirm-text="confirmState.confirmText"
      :cancel-text="confirmState.cancelText"
      @confirm="confirmState.resolve(true)"
      @cancel="confirmState.resolve(false)"
    />
    <!-- Unsaved Changes 3-option dialog -->
    <BaseModal
      :is-open="unsavedChangesState.isOpen"
      title="Unsaved Changes"
      max-width="450px"
      @close="unsavedChangesState.resolve('cancel')"
    >
      <div class="confirm-content">
        <p>You have unsaved changes. What would you like to do?</p>
      </div>
      <template #footer>
        <button class="dialog-button dialog-button-secondary" @click="unsavedChangesState.resolve('cancel')">
          {{ unsavedChangesState.context === 'quit' ? 'Keep working' : 'Cancel' }}
        </button>
        <button class="dialog-button dialog-button-danger" @click="unsavedChangesState.resolve('discard')">
          {{ unsavedChangesState.context === 'quit' ? 'Discard and Quit' : 'Discard changes' }}
        </button>
        <button class="dialog-button dialog-button-success" @click="unsavedChangesState.resolve('save')">
          {{ unsavedChangesState.context === 'quit' ? 'Save and Quit' : 'Save' }}
        </button>
      </template>
    </BaseModal>

    <GenericAlertDialog
      :is-open="alertState.isOpen"
      :title="alertState.title"
      :message="alertState.message"
      @close="alertState.resolve()"
    />
    <LicenseAgreementDialog
      :is-open="isLicenseDialogOpen"
      @agree="handleLicenseAgree"
      @exit="handleLicenseExit"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useCaptionStore } from './stores/captionStore'
import CaptionTable from './components/CaptionTable.vue'
import MediaPlayer from './components/MediaPlayer.vue'
import FileDropZone from './components/FileDropZone.vue'
import RenameSpeakerDialog from './components/RenameSpeakerDialog.vue'
import BulkSetSpeakerDialog from './components/BulkSetSpeakerDialog.vue'
import ConfirmDeleteDialog from './components/ConfirmDeleteDialog.vue'
import ConfirmAsrDialog from './components/ConfirmAsrDialog.vue'
import RemuxMp3Dialog from './components/RemuxMp3Dialog.vue'
import AsrModal from './components/AsrModal.vue'
import GenericConfirmDialog from './components/GenericConfirmDialog.vue'
import BaseModal from './components/BaseModal.vue'
import GenericAlertDialog from './components/GenericAlertDialog.vue'
import LicenseAgreementDialog from './components/LicenseAgreementDialog.vue'
import packageJson from '../package.json'
import { exportDocumentToSrt } from './utils/srt'
import { sidecarName } from './utils/fileUtils'

// Log version on startup
console.log(`========================================`)
console.log(`Caption Editor v${packageJson.version}`)
console.log(`Running in: ${(window as any).electronAPI?.isElectron ? 'Electron' : 'Browser'}`)
console.log(`========================================`)

const store = useCaptionStore()

// License agreement
const LICENSE_ACCEPTED_KEY = 'caption-editor-license-accepted'
const isLicenseDialogOpen = ref(false)

const leftPanelWidth = computed({
  get: () => store.leftPanelWidth,
  set: (v: number) => { store.leftPanelWidth = v }
})
const fileDropZone = ref<InstanceType<typeof FileDropZone> | null>(null)
const isRenameSpeakerDialogOpen = ref(false)
const isBulkSetSpeakerDialogOpen = ref(false)
const bulkSetRowCount = ref(0)
const selectedSegmentIdsForBulkSet = ref<string[]>([])
const isDeleteConfirmDialogOpen = ref(false)
const deleteRowCount = ref(0)
const selectedSegmentIdsForDelete = ref<string[]>([])
let isResizing = false

// ASR state
const isAsrConfirmDialogVisible = ref(false)
const isRemuxMp3DialogVisible = ref(false)
const pendingRemuxMp3 = ref(false)
const isAsrModalVisible = ref(false)
const isAsrRunning = ref(false)
const asrFailed = ref(false)
const asrModalTitle = ref('Speech Recognition')
const asrModal = ref<any>(null)
let currentAsrProcessId: string | null = null

// Generic Dialog Promise Wrappers
const confirmState = ref({
  isOpen: false,
  title: '',
  message: '',
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  resolve: (_value: boolean) => {}
})

const alertState = ref({
  isOpen: false,
  title: '',
  message: '',
  resolve: () => {}
})

// Unsaved changes 3-option dialog state
type UnsavedChangesResult = 'save' | 'discard' | 'cancel'
const unsavedChangesState = ref({
  isOpen: false,
  context: 'quit' as 'quit' | 'continue',
  resolve: (_value: UnsavedChangesResult) => {}
})

async function showConfirm(options: { 
  title?: string, 
  message: string, 
  confirmText?: string, 
  cancelText?: string 
}): Promise<boolean> {
  return new Promise((resolve) => {
    confirmState.value = {
      isOpen: true,
      title: options.title || 'Confirm',
      message: options.message,
      confirmText: options.confirmText || 'Confirm',
      cancelText: options.cancelText || 'Cancel',
      resolve: (value) => {
        confirmState.value.isOpen = false
        resolve(value)
      }
    }
  })
}

async function showAlert(options: { 
  title?: string, 
  message: string 
}): Promise<void> {
  return new Promise((resolve) => {
    alertState.value = {
      isOpen: true,
      title: options.title || 'Notice',
      message: options.message,
      resolve: () => {
        alertState.value.isOpen = false
        resolve()
      }
    }
  })
}

// Track if we've already attempted auto-load for the current document
const attemptedAutoLoad = ref<string | null>(null)

// Test helper: shared Electron E2E tests reset the store between tests, but
// App-level refs like this one can otherwise leak across tests.
;(window as any).__resetAttemptedAutoLoad = () => {
  attemptedAutoLoad.value = null
}

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

function handleLicenseAgree() {
  localStorage.setItem(LICENSE_ACCEPTED_KEY, 'true')
  isLicenseDialogOpen.value = false
}

function handleLicenseExit() {
  const electronAPI = (window as any).electronAPI
  if (electronAPI?.quitApp) {
    electronAPI.quitApp()
  } else {
    window.close()
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
  console.log('[App] openBulkSetSpeakerDialog called')
  const customEvent = event as CustomEvent
  const { rowCount } = customEvent.detail

  // Get the currently selected rows from CaptionTable
  // We need to get the segment IDs from the grid
  const selectedRows = (window as any).__captionTableSelectedRows || []

  bulkSetRowCount.value = rowCount
  selectedSegmentIdsForBulkSet.value = selectedRows.map((row: any) => row.id)
  isBulkSetSpeakerDialogOpen.value = true
}

function closeBulkSetSpeakerDialog() {
  isBulkSetSpeakerDialogOpen.value = false
  selectedSegmentIdsForBulkSet.value = []
  bulkSetRowCount.value = 0
}

function handleBulkSetSpeaker({ speakerName }: { speakerName: string }) {
  console.log(
    'Bulk setting speaker to:',
    speakerName,
    'for',
    selectedSegmentIdsForBulkSet.value.length,
    'segments'
  )
  store.bulkSetSpeaker(selectedSegmentIdsForBulkSet.value, speakerName)
}

function openDeleteConfirmDialog(event: Event) {
  const customEvent = event as CustomEvent
  const { rowCount } = customEvent.detail

  // Get the currently selected rows from CaptionTable
  const selectedRows = (window as any).__captionTableSelectedRows || []

  deleteRowCount.value = rowCount
  selectedSegmentIdsForDelete.value = selectedRows.map((row: any) => row.id)
  isDeleteConfirmDialogOpen.value = true
}

function closeDeleteConfirmDialog() {
  isDeleteConfirmDialogOpen.value = false
  selectedSegmentIdsForDelete.value = []
  deleteRowCount.value = 0
}

function handleConfirmDelete() {
  console.log('Deleting', selectedSegmentIdsForDelete.value.length, 'segments')
  store.bulkDeleteSegments(selectedSegmentIdsForDelete.value)
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
 * Attempts to automatically load media file referenced in document metadata
 * This works in Electron mode only - browser mode cannot access file system
 */
async function attemptMediaAutoLoad() {
  const metadata = store.document.metadata
  const mediaFilePath = metadata?.mediaFilePath
  const documentId = metadata?.id

  // Skip if no media file path in metadata
  if (!mediaFilePath) {
    console.log('[Auto-load] No mediaFilePath in document metadata')
    return
  }

  // Skip if we already attempted auto-load for this document
  if (attemptedAutoLoad.value === documentId) {
    console.log('[Auto-load] Already attempted for this document')
    return
  }

  console.log('[Auto-load] Document metadata references media file:', mediaFilePath)

  // Mark that we've attempted auto-load for this document
  attemptedAutoLoad.value = documentId

  // Check if we're in Electron mode
  const isElectron = !!(window as any).electronAPI?.isElectron

  if (isElectron && (window as any).electronAPI && store.document.filePath) {
    try {
      const electronAPI = (window as any).electronAPI
      const captionsFilePath = store.document.filePath

      // Check if the media path is already absolute
      let resolvedMediaPath: string
      if (electronAPI.path && electronAPI.path.isAbsolute(mediaFilePath)) {
        // Path is already absolute, use it directly
        resolvedMediaPath = mediaFilePath
      } else {
        // Path is relative, resolve it relative to the captions file directory
        if (electronAPI.path) {
          const captionsDir = electronAPI.path.dirname(captionsFilePath)
          resolvedMediaPath = electronAPI.path.resolve(captionsDir, mediaFilePath)
        } else {
          // Fallback to manual path concatenation if path API not available
          const captionsDir = captionsFilePath.substring(0, Math.max(
            captionsFilePath.lastIndexOf('/'),
            captionsFilePath.lastIndexOf('\\')
          ))
          resolvedMediaPath = captionsDir + '/' + mediaFilePath.replace(/\\/g, '/')
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
        console.warn('[Auto-load] Media file referenced in metadata not found:', resolvedMediaPath)
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

// Watch for media path and segments changes and update ASR menu enabled state
watch(
  [() => store.mediaPath, () => store.document.segments.length],
  ([mediaPath, segmentCount]) => {
    if ((window as any).electronAPI?.updateAsrMenuEnabled) {
      (window as any).electronAPI.updateAsrMenuEnabled({
        caption: !!mediaPath,
        embed: !!mediaPath && segmentCount > 0
      })
    }
  },
  { immediate: true }
)

/**
 * Menu action handlers
 */
async function confirmDiscardChanges(context: 'quit' | 'continue' = 'continue'): Promise<UnsavedChangesResult> {
  if (store.isDirty && store.document.segments.length > 0) {
    return new Promise((resolve) => {
      unsavedChangesState.value = {
        isOpen: true,
        context,
        resolve: (value) => {
          unsavedChangesState.value.isOpen = false
          resolve(value)
        }
      }
    })
  }
  return 'discard' // No unsaved changes, proceed
}

async function handleMenuOpenFile() {
  const result = await confirmDiscardChanges('continue')
  if (result === 'save') await handleMenuSaveFile()
  if (result !== 'cancel') fileDropZone.value?.triggerFileInput()
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

  console.log('Saving captions file to:', store.document.filePath)
  try {
    const content = store.exportToString()

    const result = await window.electronAPI.saveExistingFile({
      filePath: store.document.filePath,
      content
    })

    if (result.success) {
      console.log('Captions file saved successfully to:', result.filePath)
      store.setIsDirty(false)
      if (result.filePath && result.filePath !== store.document.filePath) {
        store.updateFilePath(result.filePath)
      }
    } else {
      console.error('Failed to save captions:', result.error)
      await showAlert({
        title: 'Save Failed',
        message: 'Failed to save captions file: ' + result.error
      })
    }
  } catch (err) {
    console.error('Failed to save captions:', err)
    await showAlert({
      title: 'Save Error',
      message: 'Failed to save captions file: ' + (err instanceof Error ? err.message : 'Unknown error')
    })
  }
}


/** Build a sidecar filename from the loaded media path (e.g. video.mp4 -> video.captions_json5) */
function mediaSidecarName(): string | null {
  return sidecarName(store.mediaFilePath)
}

async function handleMenuSaveAs() {
  if (!window.electronAPI) {
    console.error('Electron API not available')
    return
  }

  console.log('Exporting captions file')
  try {
    const content = store.exportToString()

    const result = await window.electronAPI.saveFile({
      content,
      suggestedName: store.document.filePath || mediaSidecarName() || 'captions.captions_json5'
    })

    if (result.success) {
      console.log('Captions file saved successfully:', result.filePath)
      store.setIsDirty(false)
      if (result.filePath) {
        store.updateFilePath(result.filePath)
      }
    } else if (result.error !== 'Save canceled') {
      console.error('Failed to save captions:', result.error)
      await showAlert({
        title: 'Save Failed',
        message: 'Failed to save captions file: ' + result.error
      })
    }
  } catch (err) {
    console.error('Failed to export captions:', err)
    await showAlert({
      title: 'Save Error',
      message: 'Failed to export captions file: ' + (err instanceof Error ? err.message : 'Unknown error')
    })
  }
}

async function handleMenuExportSrt() {
  if (!window.electronAPI) return
  try {
    const srtContent = exportDocumentToSrt(store.document)
    const result = await (window.electronAPI as any).saveSrtFile({
      content: srtContent,
      suggestedName: 'captions.srt'
    })
    if (!result.success && result.error !== 'Save canceled') {
      await showAlert({
        title: 'Export Failed',
        message: 'Failed to export SRT: ' + result.error
      })
    }
  } catch (err) {
    await showAlert({
      title: 'Export Error',
      message: 'Failed to export SRT: ' + (err instanceof Error ? err.message : 'Unknown error')
    })
  }
}

// ASR menu handler
async function handleMenuAsrCaption() {
  console.log('[ASR] Caption menu item clicked')
  const discardResult = await confirmDiscardChanges('continue')
  if (discardResult === 'save') await handleMenuSaveFile()
  if (discardResult === 'cancel') return

  if (store.document.segments.length > 0) {
    isAsrConfirmDialogVisible.value = true
  } else {
    maybeShowRemuxDialog()
  }
}

// Speaker Embedding menu handler
async function handleMenuAsrEmbed() {
  console.log('[ASR] Embed menu item clicked')
  
  // We need to ensure the captions file is saved before embedding
  if (!store.document.filePath) {
    // If no file path, ask user to save it first
    await showAlert({
      title: 'Save Required',
      message: 'Please save the captions file before computing speaker embeddings.'
    })
    handleMenuSaveAs()
    return
  }

  // Auto-save the current state to the existing file
  const content = store.exportToString()
  const result = await (window as any).electronAPI.saveExistingFile({
    filePath: store.document.filePath,
    content
  })

  if (!result.success) {
    await showAlert({
      title: 'Save Failed',
      message: 'Failed to save captions file before embedding: ' + result.error
    })
    return
  }

  store.setIsDirty(false)
  startAsrEmbedding()
}

function closeAsrConfirmDialog() {
  isAsrConfirmDialogVisible.value = false
}

function handleAsrConfirmed() {
  isAsrConfirmDialogVisible.value = false
  maybeShowRemuxDialog()
}

function isMp3File(): boolean {
  return !!store.mediaFilePath && store.mediaFilePath.toLowerCase().endsWith('.mp3')
}

function maybeShowRemuxDialog() {
  if (isMp3File()) {
    isRemuxMp3DialogVisible.value = true
  } else {
    pendingRemuxMp3.value = false
    startAsrTranscription()
  }
}

function handleRemuxMp3Confirmed() {
  isRemuxMp3DialogVisible.value = false
  pendingRemuxMp3.value = true
  startAsrTranscription()
}

function handleRemuxMp3Skipped() {
  isRemuxMp3DialogVisible.value = false
  pendingRemuxMp3.value = false
  startAsrTranscription()
}

async function startAsrEmbedding() {
  if (!window.electronAPI?.asr) return
  if (!store.document.filePath) return

  console.log('[ASR] Starting speaker embedding for:', store.document.filePath)

  isAsrModalVisible.value = true
  isAsrRunning.value = true
  asrFailed.value = false
  asrModalTitle.value = 'Computing Embeddings'

  try {
    const model = (window as any).__ASR_MODEL_OVERRIDE || undefined
    
    const asrHr = () => console.log('='.repeat(76))
    asrHr()
    console.log('[ASR] Renderer: waiting on main process — Python may look "done" in the log while the app is still finishing subprocess exit, reading the file, and IPC.')
    asrHr()
    const result = await window.electronAPI.asr.embed({
      captionsPath: store.document.filePath,
      model
    })

    if (result.canceled) {
      console.log('[ASR] Speaker embedding was canceled')
      isAsrRunning.value = false
      currentAsrProcessId = null
      return
    }

    if (!result.success) {
      throw new Error(result.error || 'Embedding failed')
    }

    console.log('[ASR] Embedding IPC finished successfully')

    // Reload the captions file with embeddings using content returned from main
    if (result.content) {
      asrHr()
      console.log('[ASR] Renderer: parsing JSON5 + loadFromFile (resets some UI state, refreshes AG Grid) — modal stays open until this finishes')
      asrHr()
      const t0 = performance.now()
      store.loadFromFile(result.content, store.document.filePath!)
      console.log(`[ASR] Renderer: loadFromFile finished in ${Math.round(performance.now() - t0)}ms — closing modal`)
      asrHr()
    } else {
      throw new Error('Embedding succeeded but no content was returned')
    }

    isAsrModalVisible.value = false
    isAsrRunning.value = false
  } catch (err) {
    console.error('[ASR] Speaker embedding failed:', err)
    asrFailed.value = true
    isAsrRunning.value = false
    if (asrModal.value) {
      asrModal.value.appendOutput('\n\n❌ Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }
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
  asrModalTitle.value = 'Speech Recognition'

  try {
    // Get model override from environment variable (for testing)
    const model = (window as any).__ASR_MODEL_OVERRIDE || undefined

    if (model) {
      console.log('[ASR] Using model override:', model)
    }

    // Use chunk size of 60 seconds -- longer can mess up NeMo's segmentation.
    const chunkSize = 60

    // Start ASR transcription
    const remuxMp3 = pendingRemuxMp3.value
    pendingRemuxMp3.value = false
    const asrHr = () => console.log('='.repeat(76))
    asrHr()
    console.log('[ASR] Renderer: waiting on main process — log may look "done" while subprocess exits, file is read, and data is sent over IPC.')
    asrHr()
    const transcribeWallStart = Date.now()
    console.log(
      '[ASR timing] transcribe IPC invoke start wallMs=' + transcribeWallStart
    )
    const result = await window.electronAPI.asr.transcribe({
      mediaFilePath: store.mediaFilePath,
      model,
      chunkSize,
      remuxMp3
    })
    const transcribeWallEnd = Date.now()
    console.log(
      '[ASR timing] transcribe IPC invoke end wallMs=' +
        transcribeWallEnd +
        ' elapsedMs=' +
        (transcribeWallEnd - transcribeWallStart) +
        ' canceled=' +
        !!result.canceled +
        ' success=' +
        result.success
    )

    if (result.canceled) {
      console.log('[ASR] Transcription was canceled')
      isAsrRunning.value = false
      currentAsrProcessId = null
      return
    }

    if (result.success) {
      console.log('[ASR] Transcription IPC finished:', result.captionsPath)

      // Merge ASR results into current document (preserves UUID, title, history, etc.)
      if (result.content) {
        asrHr()
        console.log('[ASR] Renderer: parsing JSON5 + mergeAsrResult (AG Grid refresh) — modal stays open until this completes')
        asrHr()
        const t0 = performance.now()
        store.mergeAsrResult(result.content)
        console.log(`[ASR] Renderer: merge finished in ${Math.round(performance.now() - t0)}ms — closing modal`)
        asrHr()
      } else {
        throw new Error('Transcription succeeded but no captions content was returned')
      }

      // Close modal on success
      isAsrModalVisible.value = false
    } else {
      throw new Error(result.error || 'Transcription failed')
    }
  } catch (err: any) {
    console.error('[ASR] Transcription failed:', err)
    asrFailed.value = true
    asrModalTitle.value = 'Transcription Failed'
    await showAlert({
      title: 'Transcription Failed',
      message: 'Failed to transcribe media: ' + (err.message || 'Unknown error')
    })

    // Show error in modal terminal
    if (asrModal.value) {
      asrModal.value.appendOutput('\n\n❌ Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  } finally {
    isAsrRunning.value = false
    currentAsrProcessId = null
  }
}

async function handleAsrCancel() {
  const wallEntry = Date.now()
  console.log(
    '[ASR timing] handleAsrCancel entry wallMs=' +
      wallEntry +
      ' isAsrRunning=' +
      isAsrRunning.value +
      ' processId=' +
      (currentAsrProcessId ?? 'null')
  )
  console.log('[ASR] Cancel button clicked')

  if (isAsrRunning.value && currentAsrProcessId && window.electronAPI?.asr) {
    // Cancel the running process
    console.log('[ASR] Cancelling process:', currentAsrProcessId)
    await window.electronAPI.asr.cancel(currentAsrProcessId)
    console.log(
      '[ASR timing] handleAsrCancel after asr.cancel() wallMs=' + Date.now()
    )
  } else {
    console.log(
      '[ASR timing] handleAsrCancel skipped IPC cancel (not running or no processId) wallMs=' +
        Date.now()
    )
  }

  // Close modal
  isAsrModalVisible.value = false
  isAsrRunning.value = false
  asrFailed.value = false
  currentAsrProcessId = null
  console.log('[ASR timing] handleAsrCancel exit modal closed wallMs=' + Date.now())
}

// Also attempt auto-load on mount (for localStorage recovery)
onMounted(() => {
  // Show license agreement on first run
  if (!localStorage.getItem(LICENSE_ACCEPTED_KEY)) {
    isLicenseDialogOpen.value = true
  }

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
  ;(window as any).handleMenuAsrEmbed = handleMenuAsrEmbed
  ;(window as any).handleMenuOpenFile = handleMenuOpenFile
  ;(window as any).showAlert = showAlert
  ;(window as any).showConfirm = showConfirm

  // Custom app close handling
  if ((window as any).electronAPI) {
    const api = (window as any).electronAPI
    
    api.onAppClose?.(async () => {
      console.log('[App] Received app-close request')
      const result = await confirmDiscardChanges('quit')
      if (result === 'save') {
        await handleMenuSaveFile()
        api.quitApp()
      } else if (result === 'discard') {
        api.quitApp()
      }
      // 'cancel' → do nothing, stay open
    })
  }

  // Set up native menu IPC listeners
  if ((window as any).electronAPI) {
    const { ipcRenderer } = (window as any).electronAPI

    if (ipcRenderer) {
      ipcRenderer.on('menu-open-file', handleMenuOpenFile)
      ipcRenderer.on('menu-save-file', handleMenuSaveFile)
      ipcRenderer.on('menu-save-as', handleMenuSaveAs)
      ipcRenderer.on('menu-export-srt', handleMenuExportSrt)
      ipcRenderer.on('menu-rename-speaker', openRenameSpeakerDialog)
      ipcRenderer.on('menu-compute-speaker-similarity', () => {
        // Dispatch custom event that CaptionTable will listen for
        window.dispatchEvent(new CustomEvent('computeSpeakerSimilarity'))
      })
      ipcRenderer.on('menu-asr-caption', handleMenuAsrCaption)
      ipcRenderer.on('menu-asr-embed', handleMenuAsrEmbed)
      console.log('[App] ✓ Native menu IPC listeners registered')
    }

    // Set up ASR output listeners
    if (window.electronAPI?.asr) {
      console.log('[App] Registering ASR listeners. asr keys:', Object.keys(window.electronAPI.asr))
      const asr = window.electronAPI.asr
      if (typeof asr.onOutput === 'function') {
        asr.onOutput((data: { processId: string, type: 'stdout' | 'stderr', data: string }) => {
          if (asrModal.value) {
            asrModal.value.appendOutput(data.data)
          }
        })
      } else {
        console.error('[App] window.electronAPI.asr.onOutput is NOT a function!', typeof asr.onOutput)
      }

      if (typeof asr.onStarted === 'function') {
        asr.onStarted((data: { processId: string }) => {
          console.log('[ASR] Process started:', data.processId)
          currentAsrProcessId = data.processId
        })
      } else {
        console.error('[App] window.electronAPI.asr.onStarted is NOT a function!', typeof asr.onStarted)
      }

      console.log('[App] ✓ ASR output listeners registration attempted')
    }
  }

  // Listen for files dropped via IPC
  if ((window as any).electronAPI?.ipcRenderer) {
    (window as any).electronAPI.ipcRenderer.on('files-dropped', async (filePaths: string[]) => {
      const dropResult = await confirmDiscardChanges('continue')
      if (dropResult === 'save') await handleMenuSaveFile()
      if (dropResult !== 'cancel') {
        try {
          const { failures } = await store.processFilePaths(filePaths)
          if (failures > 0) {
            await showAlert({
              title: 'File Load Partial Failure',
              message: `Failed to load ${failures} file(s). Check console for details.`
            })
          }
        } catch (err) {
          await showAlert({
            title: 'File Drop Failed',
            message: 'Failed to process files: ' + (err instanceof Error ? err.message : 'Unknown error')
          })
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

/* Restore ag-grid filter popup default styles */
.ag-popup .ag-filter {
  padding: 6px;
}
.ag-popup .ag-filter-body-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ag-popup .ag-picker-field-wrapper {
  min-height: 24px;
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
  background: var(--app-bg);
  color: var(--text-1);
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
  overflow: visible;
  background: var(--surface-1);
  display: flex;
  flex-direction: column;
}

.resizer {
  width: 4px;
  background: var(--border-1);
  cursor: col-resize;
  flex-shrink: 0;
}

.resizer:hover {
  background: var(--border-2);
}

.right-panel {
  height: 100%;
  overflow: auto;
  background: var(--surface-2);
}

/* Unsaved changes dialog buttons */
.confirm-content {
  color: var(--text-1);
}

.dialog-button {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.dialog-button-secondary {
  background: var(--btn-secondary-bg);
  color: var(--btn-secondary-text);
}

.dialog-button-secondary:hover {
  background: var(--btn-secondary-hover-bg);
}

.dialog-button-danger {
  background: #ef4444;
  color: #fff;
}

.dialog-button-danger:hover {
  background: #dc2626;
}

.dialog-button-success {
  background: #22c55e;
  color: #fff;
}

.dialog-button-success:hover {
  background: #16a34a;
}

/* Hover tooltips: class + data-tooltip (global so cell renderers and AG Grid headers can use them) */
.tooltip-btn {
  position: relative;
}
.tooltip-btn[data-tooltip]:hover::after {
  content: attr(data-tooltip);
  position: absolute;
  left: 50%;
  top: 100%;
  transform: translateX(-50%);
  margin-top: 6px;
  padding: 4px 8px;
  background: var(--tooltip-bg);
  color: var(--tooltip-text);
  font-size: 12px;
  /* Shrink-to-fit uses the button as containing block; without max-content the box
     collapses to ~trigger width and long text stacks one word per line. */
  width: max-content;
  max-width: min(320px, 90vw);
  white-space: normal;
  text-align: center;
  border-radius: 4px;
  z-index: 100000;
  pointer-events: none;
}
</style>
