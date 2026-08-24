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
    <PreferencesDialog
      :is-open="isPreferencesDialogOpen"
      @close="isPreferencesDialogOpen = false"
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
import ConfirmDeleteDialog from './components/ConfirmDeleteDialog.vue'
import ConfirmAsrDialog from './components/ConfirmAsrDialog.vue'
import RemuxMp3Dialog from './components/RemuxMp3Dialog.vue'
import AsrModal from './components/AsrModal.vue'
import GenericConfirmDialog from './components/GenericConfirmDialog.vue'
import BaseModal from './components/BaseModal.vue'
import GenericAlertDialog from './components/GenericAlertDialog.vue'
import LicenseAgreementDialog from './components/LicenseAgreementDialog.vue'
import PreferencesDialog from './components/PreferencesDialog.vue'
import { usePreferencesStore } from './stores/preferencesStore'
import packageJson from '../package.json'
import { exportDocumentToSrt } from './utils/srt'
import { sidecarName } from './utils/fileUtils'

// Log version on startup
console.log(`========================================`)
console.log(`Caption Editor v${packageJson.version}`)
console.log(`Running in: ${(window as any).electronAPI?.isElectron ? 'Electron' : 'Browser'}`)
console.log(`========================================`)

const store = useCaptionStore()
const preferencesStore = usePreferencesStore()

// Preferences dialog (opened from the Settings/Preferences menu item, or Cmd+,)
const isPreferencesDialogOpen = ref(false)

function openPreferencesDialog() {
  isPreferencesDialogOpen.value = true
}

// License agreement
const LICENSE_ACCEPTED_KEY = 'caption-editor-license-accepted'
const isLicenseDialogOpen = ref(false)

const leftPanelWidth = computed({
  get: () => store.leftPanelWidth,
  set: (v: number) => { store.leftPanelWidth = v }
})
const fileDropZone = ref<InstanceType<typeof FileDropZone> | null>(null)
const isRenameSpeakerDialogOpen = ref(false)
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
/** In-flight unsaved-changes dialog, so concurrent callers share one prompt. */
let pendingUnsavedChanges: Promise<UnsavedChangesResult> | null = null
/** Transcript path this window has claimed with the main process. */
let claimedFilePath: string | null = null

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
  const api = (window as any).electronAPI
  if (api?.setLicenseAccepted) {
    void api.setLicenseAccepted()
  }
  isLicenseDialogOpen.value = false
}

function isLicenseAccepted(): boolean {
  const api = (window as any).electronAPI
  if (api?.getLicenseAcceptedSync) {
    if (api.getLicenseAcceptedSync()) return true
    if (localStorage.getItem(LICENSE_ACCEPTED_KEY) === 'true') {
      void api.setLicenseAccepted?.()
      return true
    }
    return false
  }
  return !!localStorage.getItem(LICENSE_ACCEPTED_KEY)
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

  // Skip only when media is already wired to the player. Same metadata.id can survive
  // a full document reload (e.g. after Compute Speaker Embeddings calls loadFromFile),
  // which clears mediaPath — we must allow auto-load to run again in that case.
  if (attemptedAutoLoad.value === documentId && store.mediaPath) {
    console.log('[Auto-load] Already loaded media for this document')
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
function isCaptionsPath(filePath: string): boolean {
  const lower = filePath.toLowerCase()
  return lower.endsWith('.captions_json5') || lower.endsWith('.captions_json')
}

/**
 * Keep the window chrome in step with the open document: title bar, macOS proxy icon,
 * and the "edited" dot in the close button. Also (re)claims ownership of the transcript
 * so the main process knows which window owns which file.
 */
watch(
  [() => store.document.filePath, () => store.document.title, () => store.isDirty],
  ([filePath, title, edited]) => {
    const api = window.electronAPI
    api?.setWindowDocumentState?.({ filePath: filePath ?? null, title: title ?? null, edited })
    if (filePath && filePath !== claimedFilePath) {
      claimedFilePath = filePath
      void api?.claimDocument?.(filePath)
    }
  },
  { immediate: true }
)

/**
 * Ask about unsaved content changes before an action that would discard them.
 *
 * There is no `segments.length` guard here: a document whose only change is a freshly
 * attached media file is still an unsaved change worth protecting. That guard used to
 * exist to paper over media auto-load marking untouched documents dirty; the store now
 * only dirties on a real attachment change, so the guard is no longer needed.
 */
async function confirmDiscardChanges(context: 'quit' | 'continue' = 'continue'): Promise<UnsavedChangesResult> {
  if (!store.isDirty) return 'discard' // Nothing to lose, proceed

  // Re-entrant: a second trigger (e.g. a file drop arriving while the quit dialog is
  // up) must join the dialog already on screen rather than orphan its promise.
  if (pendingUnsavedChanges) return pendingUnsavedChanges

  pendingUnsavedChanges = new Promise<UnsavedChangesResult>((resolve) => {
    unsavedChangesState.value = {
      isOpen: true,
      context,
      resolve: (value) => {
        unsavedChangesState.value.isOpen = false
        pendingUnsavedChanges = null
        resolve(value)
      }
    }
  })
  return pendingUnsavedChanges
}

/**
 * Single entry point for replacing the open document from file paths — used by the
 * Open menu, drag & drop, and files opened from the OS (Finder double-click, dock drop).
 * All three previously had different behavior; the OS path skipped the unsaved-changes
 * check entirely and silently discarded edits.
 */
async function openDocumentFromPaths(filePaths: string[]): Promise<void> {
  if (filePaths.length === 0) return

  // Refuse to open a transcript that another window is already editing — two windows
  // holding independent copies means whichever saves last silently wins. The main
  // process focuses the window that owns it instead.
  const captionsPath = filePaths.find(isCaptionsPath)
  if (captionsPath && window.electronAPI?.claimDocument) {
    const claim = await window.electronAPI.claimDocument(captionsPath)
    if (!claim.claimed) {
      console.log('[App] Already open in another window:', captionsPath)
      return
    }
  }

  const result = await confirmDiscardChanges('continue')
  if (result === 'save') await handleMenuSaveFile()
  if (result === 'cancel') return

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
      title: 'File Load Failed',
      message: 'Failed to process files: ' + (err instanceof Error ? err.message : 'Unknown error')
    })
  }
}

/**
 * Persist view-only state (grid layout, filters, playhead, selection) without prompting.
 * Called on window close so the user returns to exactly where they left off, the way
 * Lightroom does. No-op unless the document is already backed by a file and has no
 * unsaved content edits (those go through the dialog instead).
 */
async function saveViewStateQuietly(): Promise<void> {
  if (!store.viewDirty || store.isDirty) return
  if (!store.document.filePath || !window.electronAPI) return

  try {
    const result = await window.electronAPI.saveExistingFile({
      filePath: store.document.filePath,
      content: store.exportToString()
    })
    if (result.success) {
      store.markSaved()
      console.log('[App] Saved view state (playhead/selection/grid) on close')
    } else {
      console.warn('[App] Could not save view state on close:', result.error)
    }
  } catch (err) {
    console.warn('[App] Could not save view state on close:', err)
  }
}

async function handleMenuOpenFile() {
  const result = await confirmDiscardChanges('continue')
  if (result === 'save') await handleMenuSaveFile()
  if (result !== 'cancel') fileDropZone.value?.triggerFileInput()
}

/** Files opened from the OS (Finder double-click, dock drop) and drag & drop. */
async function handleExternalFileOpen(filePaths: string[]) {
  await openDocumentFromPaths(filePaths)
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
      store.markSaved()
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
      store.markSaved()
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

  // Transcribing replaces the segments, but keeps the document's identity, title, and
  // media attachment. So unsaved *segment* edits are what is at risk here — a document
  // whose only unsaved change is a freshly attached media file loses nothing, and
  // prompting about it would just be noise in front of the ASR dialog.
  if (store.document.segments.length > 0) {
    const discardResult = await confirmDiscardChanges('continue')
    if (discardResult === 'save') await handleMenuSaveFile()
    if (discardResult === 'cancel') return
  }

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

  // The file on disk now matches memory (including playhead/selection in uiState, which
  // the embedding tool round-trips), so reloading it below restores the user's place.
  store.markSaved()
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

      // If the user ran ASR on a media file with no document open yet,
      // the in-memory doc should adopt the sidecar ASR just wrote so that
      // Cmd+S saves in place instead of opening Save As. If a document was
      // already open (filePath set), keep that path — the user expects save
      // to go back to their existing file, not the ASR sidecar.
      const hadNoPriorDocument = !store.document.filePath

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

      if (hadNoPriorDocument && result.captionsPath) {
        store.updateFilePath(result.captionsPath)
        // ASR's on-disk sidecar matches what we just merged in — no edits yet.
        store.markSaved()
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
  if (!isLicenseAccepted()) {
    isLicenseDialogOpen.value = true
  }

  setTimeout(() => {
    attemptMediaAutoLoad()
  }, 200)

  // Listen for openDeleteConfirmDialog event from CaptionTable's context menu
  window.addEventListener('openDeleteConfirmDialog', openDeleteConfirmDialog as EventListener)

  // Expose dialog functions for testing
  ;(window as any).openRenameSpeakerDialog = openRenameSpeakerDialog
  ;(window as any).openDeleteConfirmDialog = openDeleteConfirmDialog
  ;(window as any).handleMenuAsrCaption = handleMenuAsrCaption
  ;(window as any).handleMenuAsrEmbed = handleMenuAsrEmbed
  ;(window as any).handleMenuOpenFile = handleMenuOpenFile
  ;(window as any).handleExternalFileOpen = handleExternalFileOpen
  ;(window as any).showAlert = showAlert
  ;(window as any).showConfirm = showConfirm
  ;(window as any).openPreferencesDialog = openPreferencesDialog

  // Preferences changed in another window: adopt without re-persisting.
  ;(window as any).electronAPI?.preferences?.onChanged?.((prefs: unknown) => {
    preferencesStore.adoptExternalPreferences(prefs)
  })

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
        // No content changes to lose, but the user may have scrolled, sorted, or moved
        // the playhead. Persist that silently so reopening lands where they left off.
        await saveViewStateQuietly()
        api.quitApp()
      } else {
        // 'cancel' → stay open, and tell main to abort any in-progress quit.
        api.cancelQuit?.()
      }
    })
  }

  // Set up native menu IPC listeners
  if ((window as any).electronAPI) {
    const { ipcRenderer } = (window as any).electronAPI

    if (ipcRenderer) {
      ipcRenderer.on('menu-open-preferences', openPreferencesDialog)
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
      await openDocumentFromPaths(filePaths)
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

/* Tooltips: `[data-tooltip].tooltip-btn` + installFloatingTooltip() in main.ts */
</style>
