<template>
  <div class="caption-table">
    <div v-if="store.document.filePath" class="file-path-display">
      <span class="file-path-value">📄 {{ store.document.filePath }}</span>
    </div>
    <div class="table-header">
      <h2>Captions ({{ store.document.segments.length }})</h2>
      <div class="header-controls">
        <button
          @click="toggleSequentialPlayback"
          class="sequential-play-btn"
          :disabled="!store.mediaPath || store.document.segments.length === 0"
          :title="sequentialPlayButtonTooltip"
        >
          {{ sequentialPlayButtonLabel }}
        </button>
        <label class="checkbox-label">
          <input type="checkbox" v-model="autoplayEnabled" />
          Autoplay (selected row)
        </label>
        <label class="checkbox-label">
          <input type="checkbox" v-model="autoScrollEnabled" />
          Auto-scroll
        </label>
      </div>
    </div>
    <ag-grid-vue
      class="ag-theme-alpine"
      :rowData="rowData"
      :columnDefs="columnDefs"
      :defaultColDef="defaultColDef"
      :rowSelection="'multiple'"
      :getRowId="getRowId"
      @grid-ready="onGridReady"
      @selection-changed="onSelectionChanged"
      @row-clicked="onRowClicked"
      @cell-context-menu="onCellContextMenu"
      @cell-editing-started="onCellEditingStarted"
      :domLayout="'normal'"
      :style="{ height: store.document.filePath ? 'calc(100% - 100px)' : 'calc(100% - 60px)' }"
    />
    <ContextMenu
      :is-visible="isContextMenuVisible"
      :position="contextMenuPosition"
      :items="contextMenuItems"
      @close="closeContextMenu"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { AgGridVue } from 'ag-grid-vue3'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'
import type { ColDef, GridApi, GridReadyEvent, SelectionChangedEvent, RowClickedEvent, CellContextMenuEvent } from 'ag-grid-community'
import { useVTTStore, PlaybackMode } from '../stores/vttStore'
import { formatTimestampSimple } from '../utils/vttParser'
import StarRatingCell from './StarRatingCell.vue'
import ActionButtonsCell from './ActionButtonsCell.vue'
import SpeakerNameCellEditor from './SpeakerNameCellEditor.vue'
import ContextMenu, { type ContextMenuItem } from './ContextMenu.vue'

const store = useVTTStore()
const gridApi = ref<GridApi | null>(null)
const autoplayEnabled = ref(false)
const autoScrollEnabled = ref(true)
let isAutoScrolling = false  // Flag to prevent autoplay during auto-scroll selection

// Speaker similarity scores (not persisted, UI-only)
const speakerSimilarityScores = ref<Map<string, number>>(new Map())

// Context menu state
const isContextMenuVisible = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const contextMenuItems = ref<ContextMenuItem[]>([])
const selectedRowsForContextMenu = ref<any[]>([])

const rowData = computed(() => {
  // Cues are always kept sorted in the document model
  return store.document.segments.map(cue => ({
    id: cue.id,
    startTime: cue.startTime,
    endTime: cue.endTime,
    startTimeFormatted: formatTimestampSimple(cue.startTime),
    endTimeFormatted: formatTimestampSimple(cue.endTime),
    text: cue.text,
    speakerName: cue.speakerName,
    rating: cue.rating,
    speakerSimilarity: speakerSimilarityScores.value.get(cue.id)
  }))
})

const columnDefs = ref<ColDef[]>([
  {
    headerCheckboxSelection: true,
    checkboxSelection: true,
    width: 50,
    pinned: 'left',
    sortable: false,
    filter: false,
    resizable: false
  },
  {
    field: 'text',
    headerName: 'Caption',
    flex: 1,
    minWidth: 200,
    editable: true,
    cellEditor: 'agLargeTextCellEditor',
    cellEditorParams: {
      maxLength: 500,
      rows: 4,
      cols: 50
    },
    wrapText: true,
    autoHeight: true,
    sortable: true,
    onCellValueChanged: (params) => {
      console.log('Caption text edited:', params.newValue)
      store.updateCue(params.data.id, { text: params.newValue })
    }
  },
  {
    field: 'speakerName',
    headerName: 'Speaker',
    width: 150,
    editable: true,
    sortable: true,
    cellEditor: SpeakerNameCellEditor,
    onCellValueChanged: (params) => {
      console.log('Speaker name edited:', params.newValue)
      store.updateCue(params.data.id, { speakerName: params.newValue })
    }
  },
  {
    field: 'speakerSimilarity',
    headerName: 'Speaker Similarity',
    width: 150,
    sortable: true,
    sort: 'desc',
    hide: true,  // Hidden by default
    valueFormatter: (params) => {
      return params.value != null ? params.value.toFixed(3) : ''
    }
  },
  {
    field: 'rating',
    headerName: 'Rating',
    width: 120,
    cellRenderer: StarRatingCell,
    sortable: true,
  },
  {
    field: 'actions',
    headerName: 'Actions',
    width: 120,
    cellRenderer: ActionButtonsCell,
    filter: false
  },
  {
    field: 'startTimeFormatted',
    colId: 'startTime',
    headerName: 'Start',
    width: 120,
    editable: true,
    sortable: true,
    cellStyle: { textAlign: 'right', direction: 'rtl', unicodeBidi: 'plaintext' },
    onCellClicked: (params) => {
      // Single click seeks to this timestamp
      if (params.data && params.event) {
        const mouseEvent = params.event as MouseEvent
        if (mouseEvent.detail <= 1) {
          const startTime = params.data.startTime
          console.log('Seeking to start time:', startTime)
          store.setCurrentTime(startTime)
          const mediaElement = document.querySelector('audio, video') as HTMLMediaElement
          if (mediaElement) {
            mediaElement.currentTime = startTime
          }
        }
      }
    },
    onCellValueChanged: (params) => {
      console.log('Start time edited:', params.newValue)
      try {
        // Parse and validate - accept simple format (ssss.000)
        const timestamp = params.newValue.trim()

        // Try to parse as float (simple format)
        const seconds = parseFloat(timestamp)

        if (isNaN(seconds) || seconds < 0) {
          throw new Error('Invalid format. Use ssss.000 (seconds with 3 decimal places)')
        }

        store.updateCue(params.data.id, { startTime: seconds })
      } catch (err) {
        alert('Invalid start time: ' + (err instanceof Error ? err.message : 'Unknown error'))
        params.node?.setDataValue('startTimeFormatted', formatTimestampSimple(params.data.startTime))
      }
    }
  },
  {
    field: 'endTimeFormatted',
    colId: 'endTime',
    headerName: 'End',
    width: 120,
    editable: true,
    sortable: true,
    cellStyle: { textAlign: 'right', direction: 'rtl', unicodeBidi: 'plaintext' },
    onCellClicked: (params) => {
      // Single click seeks to this timestamp
      if (params.data && params.event) {
        const mouseEvent = params.event as MouseEvent
        if (mouseEvent.detail <= 1) {
          const endTime = params.data.endTime
          console.log('Seeking to end time:', endTime)
          store.setCurrentTime(endTime)
          const mediaElement = document.querySelector('audio, video') as HTMLMediaElement
          if (mediaElement) {
            mediaElement.currentTime = endTime
          }
        }
      }
    },
    onCellValueChanged: (params) => {
      console.log('End time edited:', params.newValue)
      try {
        // Parse and validate - accept simple format (ssss.000)
        const timestamp = params.newValue.trim()

        // Try to parse as float (simple format)
        const seconds = parseFloat(timestamp)

        if (isNaN(seconds) || seconds < 0) {
          throw new Error('Invalid format. Use ssss.000 (seconds with 3 decimal places)')
        }

        store.updateCue(params.data.id, { endTime: seconds })
      } catch (err) {
        alert('Invalid end time: ' + (err instanceof Error ? err.message : 'Unknown error'))
        params.node?.setDataValue('endTimeFormatted', formatTimestampSimple(params.data.endTime))
      }
    }
  }
])

const defaultColDef = ref<ColDef>({
  sortable: false,  // Disable sorting by default; columns can opt-in with sortable: true
  filter: true,
  resizable: true
})

function getRowId(params: { data: { id: string } }) {
  return params.data.id
}

function onGridReady(params: GridReadyEvent) {
  console.log('AG Grid ready')
  gridApi.value = params.api

  // Expose grid API to window for testing
  ;(window as any).__agGridApi = params.api
}

function onRowClicked(event: RowClickedEvent) {
  if (event.data) {
    const cueId = event.data.id
    const startTime = event.data.startTime
    console.log('Row clicked:', cueId, 'startTime:', startTime)
    store.selectCue(cueId)

    // Move playhead to the start of the clicked cue
    store.setCurrentTime(startTime)

    // Also update the media element directly to ensure scrubber syncs
    const mediaElement = document.querySelector('audio, video') as HTMLMediaElement
    if (mediaElement) {
      mediaElement.currentTime = startTime
    }
  }
}

function onSelectionChanged(event: SelectionChangedEvent) {
  const selectedRows = event.api.getSelectedRows()
  if (selectedRows.length > 0) {
    const row = selectedRows[0]
    const cueId = row.id
    console.log('Selected cue:', cueId, 'isAutoScrolling:', isAutoScrolling)
    store.selectCue(cueId)

    // If autoplay is enabled AND we're not auto-scrolling, play the segment
    // (During auto-scroll, we don't want to trigger autoplay)
    if (autoplayEnabled.value && !isAutoScrolling) {
      console.log('Autoplay: playing segment for cue:', cueId)
      // Create a playlist of just this one segment
      store.startPlaylistPlayback([cueId], 0)
    }
  }
}

// Sequential playback button label and tooltip
const sequentialPlayButtonLabel = computed(() => {
  return store.playbackMode === PlaybackMode.SEGMENTS_PLAYING ? '⏸ Pause Segments' : '▶️ Play Segments'
})

const sequentialPlayButtonTooltip = computed(() => {
  if (store.playbackMode === PlaybackMode.SEGMENTS_PLAYING) {
    return 'Pause segment playback'
  }
  return 'Play segments in table order, skipping silence'
})

/**
 * Toggle sequential playback mode
 * Starts playing from the currently selected row if any, otherwise from the top
 */
function toggleSequentialPlayback() {
  if (!gridApi.value) return

  if (store.playbackMode === PlaybackMode.SEGMENTS_PLAYING) {
    // Stop playlist playback
    console.log('Stopping playlist playback')
    store.stopPlaylistPlayback(false)  // Don't return to start on manual stop
  } else {
    // Start playlist playback with all segments in table order
    // Get all rows in their current display order
    const allSegmentIds: string[] = []
    gridApi.value.forEachNodeAfterFilterAndSort((node) => {
      if (node.data) {
        allSegmentIds.push(node.data.id)
      }
    })

    if (allSegmentIds.length === 0) {
      console.warn('No segments to play')
      return
    }

    // Find the starting index - either the selected row or 0
    let startIndex = 0
    const selectedRows = gridApi.value.getSelectedRows()
    if (selectedRows.length > 0) {
      const selectedId = selectedRows[0].id
      const foundIndex = allSegmentIds.indexOf(selectedId)
      if (foundIndex >= 0) {
        startIndex = foundIndex
      }
    }

    console.log('Starting playlist playback with', allSegmentIds.length, 'segments from index', startIndex)
    store.startPlaylistPlayback(allSegmentIds, startIndex)
  }
}

// Calculate cosine similarity between two vectors
function cosineSimilarity(vecA: readonly number[], vecB: readonly number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length')
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i]
    normA += vecA[i] * vecA[i]
    normB += vecB[i] * vecB[i]
  }

  normA = Math.sqrt(normA)
  normB = Math.sqrt(normB)

  if (normA === 0 || normB === 0) {
    return 0
  }

  return dotProduct / (normA * normB)
}

// Compute speaker similarity scores for all rows based on selected rows
function computeSpeakerSimilarity() {
  if (!gridApi.value) return

  const selectedRows = gridApi.value.getSelectedRows()
  if (selectedRows.length === 0) {
    console.warn('No rows selected for speaker similarity computation')
    return
  }

  console.log('Computing speaker similarity for', selectedRows.length, 'selected rows')

  // Check if any selected rows are missing embeddings
  const rowsWithoutEmbeddings: string[] = []
  for (const row of selectedRows) {
    const embedding = store.document.embeddings?.find(e => e.segmentId === row.id)
    if (!embedding || embedding.speakerEmbedding.length === 0) {
      rowsWithoutEmbeddings.push(row.id)
    }
  }

  if (rowsWithoutEmbeddings.length > 0) {
    console.warn('Selected rows missing embeddings:', rowsWithoutEmbeddings)
    alert(`Error: ${rowsWithoutEmbeddings.length} selected row(s) are missing speaker embeddings. Please select only rows with embeddings.`)
    return
  }

  // Get embeddings for selected rows (all should have embeddings at this point)
  const selectedEmbeddings: Array<{ id: string, embedding: readonly number[] }> = []
  for (const row of selectedRows) {
    const embedding = store.document.embeddings?.find(e => e.segmentId === row.id)
    if (embedding && embedding.speakerEmbedding.length > 0) {
      selectedEmbeddings.push({ id: row.id, embedding: embedding.speakerEmbedding })
    }
  }

  console.log('Found embeddings for', selectedEmbeddings.length, 'selected rows')

  // Compute similarity scores for all rows
  const newScores = new Map<string, number>()

  for (const cue of store.document.segments) {
    const embedding = store.document.embeddings?.find(e => e.segmentId === cue.id)
    if (!embedding || embedding.speakerEmbedding.length === 0) {
      // No embedding for this row - assign 0 similarity
      newScores.set(cue.id, 0)
      continue
    }

    // Compute maximum cosine similarity to any selected row
    let maxSimilarity = -1
    for (const selected of selectedEmbeddings) {
      const similarity = cosineSimilarity(embedding.speakerEmbedding, selected.embedding)
      maxSimilarity = Math.max(maxSimilarity, similarity)
    }

    newScores.set(cue.id, maxSimilarity)
  }

  console.log('Computed similarity scores for', newScores.size, 'rows')
  speakerSimilarityScores.value = newScores

  // Show the speaker similarity column
  gridApi.value.setColumnVisible('speakerSimilarity', true)
  console.log('Speaker similarity column is now visible')

  // Refresh the grid to show new values
  gridApi.value.refreshCells()

  // Auto-sort by speaker similarity in descending order
  const speakerSimilarityCol = gridApi.value.getColumn('speakerSimilarity')
  if (speakerSimilarityCol) {
    gridApi.value.applyColumnState({
      state: [{ colId: 'speakerSimilarity', sort: 'desc' }],
      defaultState: { sort: null }
    })
    console.log('Auto-sorted by speaker similarity (descending)')

    // Scroll to top after sorting
    gridApi.value.ensureIndexVisible(0, 'top')
    console.log('Scrolled to top of grid')
  }
}

// Note: With immutableData: true and getRowId, AG Grid handles updates automatically
// No need to manually refresh cells when segments change

// Sync store.selectedCueId to AG Grid selection
// This ensures when the store programmatically selects a cue (e.g., startPlaylistPlayback),
// the AG Grid UI updates to show the selection
watch(() => store.selectedCueId, (cueId) => {
  if (!gridApi.value || !cueId) return

  const rowNode = gridApi.value.getRowNode(cueId)
  if (rowNode) {
    // Always deselect all and select this node, even if AG Grid thinks it's already selected
    // This ensures the selection is correct in the UI
    console.log('[CaptionTable] Syncing store selection to AG Grid:', cueId)
    gridApi.value.deselectAll()
    rowNode.setSelected(true)
    // Optionally ensure visible (but don't scroll if already visible)
    gridApi.value.ensureNodeVisible(rowNode, null)
  }
})

// Auto-scroll: watch currentTime and scroll to the intersecting row
watch(() => store.currentTime, (currentTime) => {
  if (!autoScrollEnabled.value || !gridApi.value) return

  // Find the first cue that the playhead intersects
  const cue = store.document.segments.find(c =>
    c.startTime <= currentTime && currentTime < c.endTime
  )

  if (cue) {
    const rowNode = gridApi.value.getRowNode(cue.id)
    if (rowNode) {
      isAutoScrolling = true

      // Select the row (highlights it blue)
      gridApi.value.deselectAll()
      rowNode.setSelected(true)

      // Scroll just enough to ensure the row is visible (don't force it to top)
      // This reduces UI jumping when the row is already visible
      gridApi.value.ensureNodeVisible(rowNode, null)

      console.log('Auto-scrolled to cue:', cue.id, 'at time:', currentTime)

      // Reset the flag after a short delay to allow selection to complete
      setTimeout(() => {
        isAutoScrolling = false
      }, 100)
    }
  }
})

// Handle computeSpeakerSimilarity event from menu
function handleComputeSpeakerSimilarity() {
  console.log('Compute speaker similarity event received')
  computeSpeakerSimilarity()
}

/**
 * Check if selected segments are temporally adjacent based on ordinal indices
 */
function areSegmentsAdjacent(segmentIds: string[]): boolean {
  if (segmentIds.length < 2) return false

  // Find all segments
  const segments = segmentIds
    .map(id => store.document.segments.find(s => s.id === id))
    .filter((s): s is typeof store.document.segments[0] => s !== undefined)

  if (segments.length !== segmentIds.length) return false

  // Compute ordinal map
  const ordinalMap = new Map<string, number>()
  store.document.segments.forEach((segment, index) => {
    ordinalMap.set(segment.id, index)
  })

  // Get ordinals for selected segments
  const ordinals = segments
    .map(s => ordinalMap.get(s.id))
    .filter((o): o is number => o !== undefined)
    .sort((a, b) => a - b)

  // Check if ordinals are consecutive
  for (let i = 0; i < ordinals.length - 1; i++) {
    if (ordinals[i + 1] !== ordinals[i] + 1) {
      return false
    }
  }

  return true
}

// Handle +/- keys for timestamp editing
function onCellEditingStarted(event: any) {
  const colId = event.column?.getColId()
  if (colId === 'startTime' || colId === 'endTime') {
    // Attach keyboard handler for +/- keys when editing timestamp cells
    setTimeout(() => {
      const input = document.querySelector(`.ag-cell[col-id="${colId}"] input`) as HTMLInputElement
      if (input) {
        console.log('Attached +/- key handler to', colId, 'input')
        const keyHandler = (keyEvent: KeyboardEvent) => {
          if (keyEvent.key === '+' || keyEvent.key === '=') {
            console.log('+ key pressed, incrementing from', input.value)
            keyEvent.preventDefault()
            keyEvent.stopPropagation()
            const currentValue = parseFloat(input.value)
            if (!isNaN(currentValue)) {
              const newValue = (currentValue + 0.1).toFixed(3)
              input.value = newValue
              // Trigger input event so AG Grid knows the value changed
              input.dispatchEvent(new Event('input', { bubbles: true }))
              console.log('Incremented to', newValue)
            }
          } else if (keyEvent.key === '-') {
            console.log('- key pressed, decrementing from', input.value)
            keyEvent.preventDefault()
            keyEvent.stopPropagation()
            const currentValue = parseFloat(input.value)
            if (!isNaN(currentValue)) {
              const newValue = Math.max(0, currentValue - 0.1).toFixed(3)
              input.value = newValue
              // Trigger input event so AG Grid knows the value changed
              input.dispatchEvent(new Event('input', { bubbles: true }))
              console.log('Decremented to', newValue)
            }
          }
        }
        input.addEventListener('keydown', keyHandler, { capture: true })
      } else {
        console.warn('Could not find input for', colId)
      }
    }, 50)
  }
}

// Handle right-click context menu on cells
function onCellContextMenu(event: CellContextMenuEvent) {
  if (!gridApi.value) return

  // Get selected rows by collecting selected nodes
  const selectedRows: any[] = []
  gridApi.value.forEachNode((node) => {
    if (node.isSelected()) {
      selectedRows.push(node.data)
    }
  })

  // Only show context menu if rows are selected
  if (selectedRows.length === 0) {
    return
  }

  // Prevent default browser context menu
  if (event.event) {
    const mouseEvent = event.event as MouseEvent
    mouseEvent.preventDefault()

    // Store position for context menu
    contextMenuPosition.value = {
      x: mouseEvent.clientX,
      y: mouseEvent.clientY
    }
  }

  // Store selected rows for context menu actions
  selectedRowsForContextMenu.value = selectedRows

  // Check if selected segments are adjacent
  const segmentIds = selectedRows.map(row => row.id)
  const isAdjacent = areSegmentsAdjacent(segmentIds)

  // Build context menu items
  contextMenuItems.value = [
    {
      label: 'Bulk Set Speaker',
      action: () => {
        // Store selected rows in window for App.vue to access
        (window as any).__captionTableSelectedRows = selectedRowsForContextMenu.value

        // Dispatch event to open bulk set speaker dialog
        window.dispatchEvent(new CustomEvent('openBulkSetSpeakerDialog', {
          detail: { rowCount: selectedRowsForContextMenu.value.length }
        }))
      }
    },
    {
      label: `Merge Adjacent Segments (${selectedRows.length})`,
      action: () => {
        // Merge the adjacent segments
        const segmentIds = selectedRowsForContextMenu.value.map(row => row.id)
        store.mergeAdjacentSegments(segmentIds)
      },
      disabled: !isAdjacent || selectedRows.length < 2
    },
    {
      label: 'Delete Selected',
      action: () => {
        // Store selected rows in window for App.vue to access
        (window as any).__captionTableSelectedRows = selectedRowsForContextMenu.value

        // Dispatch event to open delete confirmation dialog
        window.dispatchEvent(new CustomEvent('openDeleteConfirmDialog', {
          detail: { rowCount: selectedRowsForContextMenu.value.length }
        }))
      }
    }
  ]

  // Show context menu
  isContextMenuVisible.value = true
}

function closeContextMenu() {
  isContextMenuVisible.value = false
}

onMounted(() => {
  window.addEventListener('computeSpeakerSimilarity', handleComputeSpeakerSimilarity)
})

onUnmounted(() => {
  window.removeEventListener('computeSpeakerSimilarity', handleComputeSpeakerSimilarity)
})
</script>

<style scoped>
.caption-table {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 10px;
}

.file-path-display {
  padding: 8px 12px;
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  margin-bottom: 8px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-path-label {
  font-weight: 600;
  color: #495057;
  white-space: nowrap;
}

.file-path-value {
  font-family: 'Courier New', monospace;
  color: #212529;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.table-header {
  padding: 10px 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.table-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.header-controls {
  display: flex;
  gap: 16px;
  align-items: center;
}

.sequential-play-btn {
  padding: 8px 16px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.2s;
  white-space: nowrap;
}

.sequential-play-btn:hover:not(:disabled) {
  background: #2980b9;
}

.sequential-play-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #555;
  cursor: pointer;
  user-select: none;
}

.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.ag-theme-alpine {
  width: 100%;
}

/* Override AG Grid's default ellipsis behavior for time columns */
:deep(.ag-cell[col-id="startTime"]),
:deep(.ag-cell[col-id="endTime"]) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl !important;
  text-align: right !important;
}

/* When editing, switch back to LTR for proper input */
:deep(.ag-cell[col-id="startTime"].ag-cell-inline-editing),
:deep(.ag-cell[col-id="endTime"].ag-cell-inline-editing) {
  direction: ltr !important;
}

/* Reduce line spacing for wrapped text in caption column */
:deep(.ag-cell[col-id="text"]) {
  line-height: 1.3;
  padding-top: 6px;
  padding-bottom: 6px;
}

/* Enable header text wrapping */
:deep(.ag-header-cell-text) {
  white-space: normal !important;
  word-wrap: break-word !important;
  line-height: 1.2;
}

:deep(.ag-header-cell-label) {
  display: flex !important;
  align-items: center;
  justify-content: center;
  text-align: center;
}
</style>
