<template>
  <div class="caption-table">
    <div v-if="store.document.filePath" class="file-path-display">
      <button
        type="button"
        class="show-in-finder-btn tooltip-btn"
        data-tooltip-placement="right"
        @click="showCaptionsInFinder"
        data-tooltip="Reveal the saved captions file in Finder"
      >📁</button>
      <span class="file-path-value">{{ store.document.filePath }}</span>
    </div>
    <div class="title-row">
      <input
        type="text"
        class="document-title-input"
        :value="store.document.title || ''"
        @input="store.updateTitle(($event.target as HTMLInputElement).value)"
        placeholder="Untitled document"
      />
    </div>
    <div class="caption-toolbar table-header">
      <!-- Same pattern as ActionsPlayHeader: disabled <button> often gets no pointer events. -->
      <span
        class="add-caption-tooltip-host tooltip-btn toolbar-add-btn-wrap"
        data-tooltip="Insert a new caption at the current time in the media"
      >
        <button
          type="button"
          class="add-caption-btn"
          :disabled="!store.mediaPath"
          @click="addCaptionAtCurrentTime"
        >
          ➕
        </button>
      </span>
      <div class="header-controls">
        <label class="checkbox-label tooltip-btn" data-tooltip="When you select a row, jump to its start time and play that caption">
          <input type="checkbox" v-model="autoplayEnabled" />
          Autoplay
        </label>
        <label class="checkbox-label tooltip-btn" data-tooltip="Scroll the table so the caption under the playhead stays in view">
          <input type="checkbox" v-model="autoScrollEnabled" />
          Auto-scroll
        </label>
        <span class="toolbar-columns">
          <ColumnManager :grid-api="gridApi" :column-defs="columnDefs" />
        </span>
      </div>
    </div>
    <!-- suppressScrollOnNewData: keep vertical scroll when rowData is replaced each store update (autoHeight / ✓) -->
    <ag-grid-vue
      class="ag-theme-alpine"
      :theme="gridTheme"
      :rowData="rowData"
      :columnDefs="columnDefs"
      :defaultColDef="defaultColDef"
      :context="gridContext"
      :rowSelection="rowSelectionConfig"
      
      :getRowId="getRowId"
      :suppressScrollOnNewData="true"
      @grid-ready="onGridReady"
      @first-data-rendered="refreshGridStats"
      @filter-changed="refreshGridStats"
      @model-updated="refreshGridStats"
      @selection-changed="onSelectionChanged"
      @row-clicked="onRowClicked"
      @cell-context-menu="onCellContextMenu"
      @cell-key-down="onCellKeyDown"
      @cell-editing-started="onCellEditingStarted"
      :domLayout="'normal'"
      style="flex: 1; min-height: 0;"
    />
    <div class="grid-stats caption-status-bar" aria-live="polite">
      {{ gridStats.total }} {{ gridStats.total === 1 ? 'caption' : 'captions' }} / {{ gridStats.visible }} visible /
      {{ gridStats.selected }} selected
    </div>
    <ContextMenu
      :is-visible="isContextMenuVisible"
      :position="contextMenuPosition"
      :header-text="contextMenuHeaderText"
      :items="contextMenuItems"
      @close="closeContextMenu"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { AgGridVue } from 'ag-grid-vue3'
import type { ColDef, GridApi, GridReadyEvent, SelectionChangedEvent, RowClickedEvent, CellContextMenuEvent, CellKeyDownEvent, ColumnState, SuppressKeyboardEventParams } from 'ag-grid-community'
import { themeAlpine } from 'ag-grid-community'
import { useCaptionStore, PlaybackMode } from '../stores/captionStore'

import StarRatingCell from './StarRatingCell.vue'
import ActionButtonsCell from './ActionButtonsCell.vue'
import ActionsPlayHeader from './ActionsPlayHeader.vue'
import SpeakerNameCellEditor from './SpeakerNameCellEditor.vue'
import VerifiedCheckCell from './VerifiedCheckCell.vue'
import ContextMenu from './ContextMenu.vue'
import ColumnManager from './ColumnManager.vue'
import type { ContextMenuItem } from './ContextMenu.types'
import type { UIState } from '../types/schema'
import { decodeEmbedding } from '../utils/embeddingCodec'
import { resolveRowActionTargetRows } from '../utils/rowActionTarget'
import {
  attachCaptionGridDebug,
  exposeCaptionGridDebugAttach,
  isCaptionGridDebugEnabled
} from '../utils/captionGridDebug'

const store = useCaptionStore()
const gridApi = ref<GridApi | null>(null)
const gridStats = ref({ total: 0, visible: 0, selected: 0 })

function refreshGridStats() {
  if (!gridApi.value) return
  const api = gridApi.value
  let visible = store.document.segments.length
  if (typeof api.getDisplayedRowCount === 'function') {
    visible = api.getDisplayedRowCount()
  } else if (typeof api.forEachNodeAfterFilterAndSort === 'function') {
    let n = 0
    api.forEachNodeAfterFilterAndSort(() => {
      n += 1
    })
    visible = n
  }
  const selected =
    typeof api.getSelectedRows === 'function' ? api.getSelectedRows().length : 0
  gridStats.value = {
    total: store.document.segments.length,
    visible,
    selected
  }
}

const autoplayEnabled = ref(false)
const autoScrollEnabled = ref(true)
let isAutoScrolling = false  // Flag to prevent autoplay during auto-scroll selection

/** Log every programmatic grid scroll so we can correlate viewport jumps with causes. */
function logProgrammaticGridScroll(
  reason: string,
  action: () => void,
  detail?: Record<string, unknown>
) {
  if (detail !== undefined && Object.keys(detail).length > 0) {
    console.log('[CaptionTable] programmatic grid scroll:', reason, detail)
  } else {
    console.log('[CaptionTable] programmatic grid scroll:', reason)
  }
  action()
}

/**
 * Debounced ensureNodeVisible — workaround for AG Grid bug where rapid
 * ensureNodeVisible calls (e.g. during scrub-bar drags) corrupt internal
 * scroll tracking, causing the viewport to jump to a stale position on
 * the next rowData update. Known AG Grid issue:
 * https://github.com/ag-grid/ag-grid/issues/1315
 * See also: #8628, #3105, #7273
 */
let _ensureVisibleTimer: ReturnType<typeof setTimeout> | null = null
function debouncedEnsureNodeVisible(rowNode: any, position: 'top' | 'bottom' | 'middle' | null) {
  if (_ensureVisibleTimer) clearTimeout(_ensureVisibleTimer)
  _ensureVisibleTimer = setTimeout(() => {
    _ensureVisibleTimer = null
    if (gridApi.value) {
      gridApi.value.ensureNodeVisible(rowNode, position)
    }
  }, 30)
}

// AG Grid v33+ Theming API (do not import legacy CSS themes)
const gridTheme = themeAlpine

// Speaker similarity scores (not persisted, UI-only)
const speakerSimilarityScores = ref<Map<string, number>>(new Map())

// Context menu state
const isContextMenuVisible = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const contextMenuItems = ref<ContextMenuItem[]>([])
const contextMenuHeaderText = ref('')
const selectedRowsForContextMenu = ref<any[]>([])



/**
 * Speaker column: first printable key and commit behavior
 *
 * Problem 1 — “James” → “ames” on empty cells: With no existing text, AG Grid uses the first
 * keystroke only to enter edit mode; that character often never reaches the `<input>`. Cells
 * that already had a speaker name were less obvious because select-all + replace masked it.
 * Playwright `keyboard.type()` also frequently left `ICellEditorParams.eventKey` unset, so the
 * editor could not recover the first letter from params alone.
 *
 * Fix: For a single printable key while not editing, call `startEditingCell({ key })` and return
 * `true` from `suppressKeyboardEvent` so the grid does not handle the same event without passing
 * the character through. Works with `SpeakerNameCellEditor`, which seeds from `eventKey` and
 * places the caret at end of that seed (see `SpeakerNameCellEditor.vue`).
 *
 * Problem 2 — viewport jumping after Enter: Addressed in the editor via `stopEditing(true)` so AG
 * Grid does not move focus to the next cell after commit (which could scroll a large grid).
 */
function suppressSpeakerNameKeyboardForTypedChar(params: SuppressKeyboardEventParams): boolean {
  if (params.editing) return false
  if (!params.data) return false
  const ev = params.event
  const k = ev.key
  if (k.length !== 1) return false
  const code = k.charCodeAt(0)
  if (code < 32 || code === 127) return false
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return false
  const rowIndex = params.node.rowIndex
  if (rowIndex == null) return false
  params.api.startEditingCell({
    rowIndex,
    colKey: 'speakerName',
    key: k
  })
  return true
}

const rowData = computed(() => {
  // Segments are always kept sorted in the document model
  return store.document.segments.map(segment => ({
    id: segment.id,
    index: segment.index,
    startTime: segment.startTime,
    endTime: segment.endTime,

    text: segment.text,
    speakerName: segment.speakerName,
    rating: segment.rating,
    verified: segment.verified,
    speakerSimilarity: speakerSimilarityScores.value.get(segment.id)
  }))
})

const columnDefs = ref<ColDef[]>([
  {
    field: 'actions',
    headerName: '',
    width: 58,
    pinned: 'left',
    headerComponent: ActionsPlayHeader,
    cellRenderer: ActionButtonsCell,
    cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
    filter: false,
    sortable: false,
    resizable: false
  },
  {
    field: 'index',
    headerName: '#',
    width: 75,
    sortable: true,
    sort: 'asc',
    pinned: 'left',
    editable: false,
    filter: false,
    resizable: true,
    cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
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
    floatingFilter: true,
    /* AG Grid new UI: header filter (magnify) is hidden while floating row shows its filter
       button; suppress that row-side button so the column header icon is visible again. */
    suppressFloatingFilterButton: true,
    onCellValueChanged: (params) => {
      console.log('Caption text edited:', params.newValue)
      store.updateSegment(params.data.id, { text: params.newValue, verified: true })
    }
  },
  {
    field: 'verified',
    headerName: '✓',
    width: 50,
    cellRenderer: VerifiedCheckCell,
    cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
    filter: false,
    sortable: true,
  },
  {
    field: 'speakerName',
    headerName: 'Speaker',
    width: 150,
    editable: true,
    sortable: true,
    floatingFilter: true,
    suppressFloatingFilterButton: true,
    cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
    cellEditor: SpeakerNameCellEditor,
    /* See suppressSpeakerNameKeyboardForTypedChar — required for reliable first-key-on-empty. */
    suppressKeyboardEvent: suppressSpeakerNameKeyboardForTypedChar,
    onCellValueChanged: (params) => {
      console.log('Speaker name edited:', params.newValue)
      const newSpeaker = params.newValue
      const api = gridApi.value
      if (!api || !params.node) {
        store.updateSegment(params.data.id, { speakerName: newSpeaker })
        return
      }
      const targets = resolveRowActionTargetRows(api, params.node)
      const ids = targets.map((r) => r.id).filter(Boolean) as string[]
      if (ids.length === 0) return
      store.bulkSetSpeaker(ids, newSpeaker)
    }
  },
  {
    field: 'speakerSimilarity',
    headerName: 'Speaker Similarity',
    width: 150,
    sortable: true,
    filter: false,
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
    cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
    sortable: true,
    floatingFilter: true,
    suppressFloatingFilterButton: true,
  },
  {
    field: 'notes',
    headerName: 'Notes',
    flex: 1,
    minWidth: 150,
    hide: true,
    editable: true,
    cellEditor: 'agLargeTextCellEditor',
    cellEditorParams: {
      maxLength: 1000,
      rows: 4,
      cols: 50
    },
    wrapText: true,
    autoHeight: true,
    floatingFilter: true,
    suppressFloatingFilterButton: true,
    onCellValueChanged: (params) => {
      store.updateSegment(params.data.id, { notes: params.newValue })
    }
  },
  {
    field: 'startTime',
    headerName: 'Start',
    width: 120,
    editable: true,
    sortable: true,
    filter: false,
    valueFormatter: (params) => params.value != null ? Number(params.value).toFixed(3) : '',
    cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', textAlign: 'right' },
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
        const seconds = parseFloat(String(params.newValue).trim())

        if (isNaN(seconds) || seconds < 0) {
          throw new Error('Invalid format. Use ssss.000 (seconds with 3 decimal places)')
        }

        store.updateSegment(params.data.id, { startTime: seconds })
      } catch (err) {
        if ((window as any).showAlert) {
          (window as any).showAlert({
            title: 'Invalid Start Time',
            message: 'Invalid format: ' + (err instanceof Error ? err.message : 'Unknown error')
          })
        }
        params.node?.setDataValue('startTime', params.data.startTime)
      }
    }
  },
  {
    field: 'endTime',
    headerName: 'End',
    width: 120,
    editable: true,
    sortable: true,
    filter: false,
    valueFormatter: (params) => params.value != null ? Number(params.value).toFixed(3) : '',
    cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', textAlign: 'right' },
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
        const seconds = parseFloat(String(params.newValue).trim())

        if (isNaN(seconds) || seconds < 0) {
          throw new Error('Invalid format. Use ssss.000 (seconds with 3 decimal places)')
        }

        store.updateSegment(params.data.id, { endTime: seconds })
      } catch (err) {
        if ((window as any).showAlert) {
          (window as any).showAlert({
            title: 'Invalid End Time',
            message: 'Invalid format: ' + (err instanceof Error ? err.message : 'Unknown error')
          })
        }
        params.node?.setDataValue('endTime', params.data.endTime)
      }
    }
  }
])

const defaultColDef = ref<ColDef>({
  sortable: false,  // Disable sorting by default; columns can opt-in with sortable: true
  filter: true,
  /* false = show header filter (magnify) where the column allows filters. We previously hid
     all header filter buttons; users still could not see them because floatingFilter + default
     suppressFloatingFilterButton also suppresses the header icon in the new column menu UX. */
  suppressHeaderFilterButton: false,
  resizable: true,
  cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }
})

// Row selection: multiRow mode with click selection enabled for shift-click range selection
const rowSelectionConfig = {
  mode: 'multiRow' as const,
  enableClickSelection: true,
  checkboxes: false,
  headerCheckbox: false
}

function getRowId(params: { data: { id: string } }) {
  return params.data.id
}

function onCellKeyDown(event: CellKeyDownEvent) {
  const keyEvent = event.event as KeyboardEvent | undefined
  if (!keyEvent) return
  if (keyEvent.key === 'Enter' && event.column.getColId() === 'actions') {
    keyEvent.preventDefault()
    if (event.data) {
      store.startPlaylistPlayback([event.data.id], 0)
    }
  }
}

/** Opt-in AG Grid scroll/layout logging — see `src/utils/captionGridDebug.ts` */
let captionGridDebugDetach: (() => void) | null = null

function wireCaptionGridDebug(api: GridApi) {
  captionGridDebugDetach?.()
  captionGridDebugDetach = null
  if (!isCaptionGridDebugEnabled()) return
  captionGridDebugDetach = attachCaptionGridDebug(api, () => ({
    currentTime: store.currentTime,
    selectedSegmentId: store.selectedSegmentId
  }))
  console.log(
    '[CaptionGridDebug] logging on — watch for [CaptionGridDebug] lines. ' +
      'Disable: localStorage.removeItem("captionDebugGrid"); reload, or set window.__captionGridDebug=false and reload.'
  )
}

function onGridReady(params: GridReadyEvent) {
  console.log('AG Grid ready')
  gridApi.value = params.api

  // Expose grid API to window for testing
  ;(window as any).__agGridApi = params.api

  exposeCaptionGridDebugAttach(
    () => {
      if (!gridApi.value) return
      wireCaptionGridDebug(gridApi.value)
    },
    isCaptionGridDebugEnabled
  )
  void nextTick(() => wireCaptionGridDebug(params.api))

  // Restore grid state if document was loaded before grid was ready
  setTimeout(restoreGridState, 0)
}

function onRowClicked(event: RowClickedEvent) {
  if (!event.data) return
  
  const { id: segmentId, startTime } = event.data
  console.log('Row clicked:', segmentId, 'startTime:', startTime)
  
  // Move playhead to the start of the clicked segment
  store.setCurrentTime(startTime)
  const mediaElement = document.querySelector('audio, video') as HTMLMediaElement
  if (mediaElement) mediaElement.currentTime = startTime
}

// Track if we're programmatically changing selection (to avoid feedback loops)
let isSyncingSelection = false

function onSelectionChanged(event: SelectionChangedEvent) {
  refreshGridStats()
  if (isSyncingSelection) return

  const selectedRows = event.api.getSelectedRows()
  if (selectedRows.length === 0) return

  const lastRow = selectedRows[selectedRows.length - 1]

  // Only sync single selection to store (multi-select is grid-only)
  if (selectedRows.length === 1) {
    store.selectSegment(lastRow.id)
  }

  // Autoplay on selection (but not during auto-scroll)
  if (autoplayEnabled.value && !isAutoScrolling) {
    store.startPlaylistPlayback([lastRow.id], 0)
  }
}

/**
 * Show captions file in Finder
 */
function showCaptionsInFinder() {
  if (store.document.filePath) {
    window.electronAPI?.showInFolder(store.document.filePath)
  }
}

/**
 * Add a new caption at the current playhead position
 */
function addCaptionAtCurrentTime() {
  console.log('Adding caption at current time:', store.currentTime)
  const segmentId = store.addSegment(store.currentTime, 5)
  store.selectSegment(segmentId)
}

/**
 * First displayed index in playlist order among selected rows, else focused row, else store selection, else 0.
 */
function sequentialPlaybackStartIndex(api: GridApi, allSegmentIds: string[]): number {
  const selectedRows = api.getSelectedRows()
  if (selectedRows.length > 0) {
    const selectedSet = new Set(selectedRows.map((r) => r.id))
    for (let i = 0; i < allSegmentIds.length; i++) {
      if (selectedSet.has(allSegmentIds[i])) return i
    }
  }
  const focused = api.getFocusedCell()
  if (focused != null && focused.rowIndex != null) {
    const node = api.getDisplayedRowAtIndex(focused.rowIndex)
    const id = node?.data?.id
    if (id) {
      const idx = allSegmentIds.indexOf(id)
      if (idx >= 0) return idx
    }
  }
  const sid = store.selectedSegmentId
  if (sid) {
    const idx = allSegmentIds.indexOf(sid)
    if (idx >= 0) return idx
  }
  return 0
}

/**
 * Toggle sequential playback mode
 * Starts playing from the selected, focused, or active row when possible, otherwise from the top
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

    const startIndex = sequentialPlaybackStartIndex(gridApi.value, allSegmentIds)

    console.log('Starting playlist playback with', allSegmentIds.length, 'segments from index', startIndex)
    store.startPlaylistPlayback(allSegmentIds, startIndex)
  }
}

/** Passed to AG Grid header/cell components (e.g. play-all header button). */
const gridContext = { toggleSequentialPlayback }

function onCaptionFindShortcut(e: KeyboardEvent) {
  const isF = e.key === 'f' || e.key === 'F'
  if (!isF || (!e.metaKey && !e.ctrlKey)) return
  const el = e.target as HTMLElement | null
  if (el?.closest('input, textarea, select, [contenteditable="true"]')) return
  const api = gridApi.value
  if (!api || typeof api.showColumnFilter !== 'function') return
  e.preventDefault()
  e.stopPropagation()
  api.showColumnFilter('text')
}

// Calculate cosine similarity between two vectors
function cosineSimilarity(vecA: ArrayLike<number>, vecB: ArrayLike<number>): number {
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

// Compute speaker similarity scores for all rows based on reference rows (or current selection)
function computeSpeakerSimilarity(referenceRows?: ReadonlyArray<{ id: string }>) {
  if (!gridApi.value) return

  const selectedRows = referenceRows?.length
    ? [...referenceRows]
    : gridApi.value.getSelectedRows()
  if (selectedRows.length === 0) {
    console.warn('No rows selected for speaker similarity computation')
    return
  }

  console.log('Computing speaker similarity for', selectedRows.length, 'reference rows')

  // Build lookup from segmentId -> decoded Float32Array
  const embeddingLookup = new Map<string, Float32Array>()
  for (const entry of store.document.embeddings ?? []) {
    if (entry.speakerEmbedding) {
      embeddingLookup.set(entry.segmentId, decodeEmbedding(entry.speakerEmbedding))
    }
  }

  // Check if any selected rows are missing embeddings
  const rowsWithoutEmbeddings: string[] = []
  for (const row of selectedRows) {
    if (!embeddingLookup.has(row.id)) {
      rowsWithoutEmbeddings.push(row.id)
    }
  }

  if (rowsWithoutEmbeddings.length > 0) {
    console.warn('Selected rows missing embeddings:', rowsWithoutEmbeddings)
    if ((window as any).showAlert) {
      (window as any).showAlert({
        title: 'Missing Embeddings',
        message: `${rowsWithoutEmbeddings.length} selected row(s) are missing speaker embeddings. Please select only rows with embeddings.`
      })
    }
    return
  }

  // Get embeddings for selected rows
  const selectedEmbeddings: Array<{ id: string, embedding: Float32Array }> = []
  for (const row of selectedRows) {
    const vec = embeddingLookup.get(row.id)
    if (vec) {
      selectedEmbeddings.push({ id: row.id, embedding: vec })
    }
  }

  console.log('Found embeddings for', selectedEmbeddings.length, 'selected rows')

  // Compute similarity scores for all rows
  const newScores = new Map<string, number>()

  for (const segment of store.document.segments) {
    const vec = embeddingLookup.get(segment.id)
    if (!vec) {
      // No embedding for this row - assign 0 similarity
      newScores.set(segment.id, 0)
      continue
    }

    // Compute maximum cosine similarity to any selected row
    let maxSimilarity = -1
    for (const selected of selectedEmbeddings) {
      const similarity = cosineSimilarity(vec, selected.embedding)
      maxSimilarity = Math.max(maxSimilarity, similarity)
    }

    newScores.set(segment.id, maxSimilarity)
  }

  console.log('Computed similarity scores for', newScores.size, 'rows')
  speakerSimilarityScores.value = newScores

  // Show the speaker similarity column
  gridApi.value.setColumnsVisible(['speakerSimilarity'], true)
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

    logProgrammaticGridScroll(
      'speaker similarity: show first row after descending sort',
      () => gridApi.value!.ensureIndexVisible(0, 'top')
    )
  }
}

// Note: With immutableData: true and getRowId, AG Grid handles updates automatically
// No need to manually refresh cells when segments change

// Helper: select a single row in AG Grid without disturbing multi-selection
function selectRowIfNeeded(rowNode: any) {
  if (rowNode.isSelected()) return false  // Already selected, don't disturb
  
  isSyncingSelection = true
  gridApi.value!.deselectAll()
  rowNode.setSelected(true)
  isSyncingSelection = false
  return true
}

// Sync store.selectedSegmentId → AG Grid (for programmatic selection, e.g., playlist playback)
watch(() => store.selectedSegmentId, (segmentId) => {
  if (!gridApi.value || !segmentId) return
  const rowNode = gridApi.value.getRowNode(segmentId)
  if (rowNode) {
    selectRowIfNeeded(rowNode)
    logProgrammaticGridScroll(
      'selectedSegmentId sync: ensure selected row is visible',
      () => debouncedEnsureNodeVisible(rowNode, null),
      { segmentId }
    )
  }
})

// Auto-scroll: follow playhead to intersecting row
watch(() => store.currentTime, (currentTime) => {
  if (!autoScrollEnabled.value || !gridApi.value) return

  const segment = store.document.segments.find(s =>
    s.startTime <= currentTime && currentTime < s.endTime
  )
  if (!segment) return

  const rowNode = gridApi.value.getRowNode(segment.id)
  if (!rowNode) return

  // If row already selected, just ensure visible (preserves multi-selection)
  if (rowNode.isSelected()) {
    logProgrammaticGridScroll(
      'auto-scroll (playhead): selected row — ensure visible',
      () => debouncedEnsureNodeVisible(rowNode, null),
      { segmentId: segment.id, currentTime }
    )
    return
  }

  isAutoScrolling = true
  selectRowIfNeeded(rowNode)
  logProgrammaticGridScroll(
    'auto-scroll (playhead): jump to segment under playhead (select + scroll)',
    () => debouncedEnsureNodeVisible(rowNode, null),
    { segmentId: segment.id, currentTime }
  )
  setTimeout(() => { isAutoScrolling = false }, 100)
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
        // Format to 3 decimal places so the display matches valueFormatter
        const numVal = parseFloat(input.value)
        if (!isNaN(numVal)) {
          input.value = numVal.toFixed(3)
          input.dispatchEvent(new Event('input', { bubbles: true }))
        }
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

  const targetRows = resolveRowActionTargetRows(gridApi.value, event.node)
  if (targetRows.length === 0) return

  if (event.event) {
    const mouseEvent = event.event as MouseEvent
    mouseEvent.preventDefault()
    contextMenuPosition.value = {
      x: mouseEvent.clientX,
      y: mouseEvent.clientY
    }
  }

  selectedRowsForContextMenu.value = targetRows

  const n = targetRows.length
  contextMenuHeaderText.value = `Targeting ${n} row${n === 1 ? '' : 's'}`

  const segmentIds = targetRows.map((row) => row.id)
  const isAdjacent = areSegmentsAdjacent(segmentIds)

  const hasAnyEmbedding = targetRows.some((row) =>
    (store.document.embeddings ?? []).some((e) => e.segmentId === row.id && e.speakerEmbedding)
  )

  contextMenuItems.value = [
    {
      label: `Merge Adjacent Segments (${targetRows.length})`,
      action: () => {
        const ids = selectedRowsForContextMenu.value.map((row) => row.id)
        store.mergeAdjacentSegments(ids)
      },
      disabled: !isAdjacent || targetRows.length < 2
    },
    {
      label: 'Sort Rows by Speaker Similarity',
      action: () => {
        computeSpeakerSimilarity(selectedRowsForContextMenu.value)
      },
      disabled: !hasAnyEmbedding
    },
    {
      label: 'Delete Selected',
      action: () => {
        (window as any).__captionTableSelectedRows = selectedRowsForContextMenu.value
        window.dispatchEvent(
          new CustomEvent('openDeleteConfirmDialog', {
            detail: { rowCount: selectedRowsForContextMenu.value.length }
          })
        )
      }
    }
  ]

  isContextMenuVisible.value = true
}

function closeContextMenu() {
  isContextMenuVisible.value = false
  contextMenuHeaderText.value = ''
}

// --- Grid state persistence ---

/** Get current grid UI state for saving */
function getGridState(): UIState | undefined {
  if (!gridApi.value) return undefined
  const columnState = gridApi.value.getColumnState()
  const filterModel = gridApi.value.getFilterModel()
  // Only persist if there's meaningful state
  const hasFilters = filterModel && Object.keys(filterModel).length > 0
  if (!columnState && !hasFilters) return undefined
  return {
    columnState: columnState as UIState['columnState'],
    filterModel: hasFilters ? filterModel : undefined
  }
}

// Register grid state provider with the store so exportToString() can capture it
store.gridStateProvider = getGridState

// Track document ID to restore state only once per file open
let lastRestoredDocumentId: string | null = null

/** Restore grid state from document if present */
function restoreGridState() {
  if (!gridApi.value) return
  const docId = store.document.metadata.id
  if (docId === lastRestoredDocumentId) {
    refreshGridStats()
    return
  }
  lastRestoredDocumentId = docId

  const uiState = store.document.uiState
  if (!uiState) {
    refreshGridStats()
    return
  }

  if (uiState.columnState) {
    gridApi.value.applyColumnState({
      state: uiState.columnState as ColumnState[],
      applyOrder: true
    })
  }
  if (uiState.filterModel) {
    gridApi.value.setFilterModel(uiState.filterModel)
  }
  console.log('Restored grid state from document')
  refreshGridStats()
}

// Restore grid state when document changes (file open)
watch(() => store.document.metadata.id, () => {
  // Use nextTick-like delay to ensure grid has processed new rowData
  setTimeout(restoreGridState, 0)
})

watch(
  rowData,
  () => {
    nextTick(() => refreshGridStats())
  },
  { deep: true }
)

onMounted(() => {
  window.addEventListener('computeSpeakerSimilarity', handleComputeSpeakerSimilarity)
  window.addEventListener('keydown', onCaptionFindShortcut, true)
})

onUnmounted(() => {
  captionGridDebugDetach?.()
  captionGridDebugDetach = null
  store.gridStateProvider = null
  window.removeEventListener('computeSpeakerSimilarity', handleComputeSpeakerSimilarity)
  window.removeEventListener('keydown', onCaptionFindShortcut, true)
})
</script>

<style scoped>
.caption-table {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 10px;
}
.title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.document-title-input {
  flex: 1;
  font-size: 18px;
  font-weight: 600;
  padding: 6px 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  outline: none;
  transition: border-color 0.2s, background 0.2s;
}

.document-title-input:hover {
  border-color: var(--border-1);
  background: var(--surface-1);
}

.document-title-input:focus {
  border-color: var(--accent-color, #4a9eff);
  background: var(--surface-1);
}

.document-title-input::placeholder {
  color: var(--text-3, #999);
  font-weight: 400;
}

.file-path-display {
  padding: 8px 12px;
  background: var(--surface-1);
  border: 1px solid var(--border-1);
  border-radius: 6px;
  margin-bottom: 8px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-path-label {
  font-weight: 600;
  color: var(--text-2);
  white-space: nowrap;
}

.file-path-value {
  color: var(--text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  font-size: 13px;
}

.show-in-finder-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  font-size: 14px;
  opacity: 0.7;
  transition: opacity 0.2s;
  position: relative;
}

.show-in-finder-btn:hover {
  opacity: 1;
}

.caption-toolbar.table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  flex-shrink: 0;
}

.header-controls {
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}

.toolbar-columns {
  margin-left: auto;
  flex-shrink: 0;
}

.toolbar-add-btn-wrap {
  flex-shrink: 0;
}

.add-caption-tooltip-host {
  display: inline-flex;
}

.add-caption-btn {
  padding: 4px 8px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 10px;
  font-weight: 500;
  line-height: 1;
  transition: background 0.2s;
  white-space: nowrap;
}

.add-caption-btn:hover:not(:disabled) {
  background: #2980b9;
}

.add-caption-btn:disabled {
  background: var(--btn-disabled-bg);
  cursor: not-allowed;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--text-2);
  cursor: pointer;
  user-select: none;
}

.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.grid-stats.caption-status-bar {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--text-2, #666);
  white-space: nowrap;
  padding: 8px 2px 0;
  margin-top: 4px;
  border-top: 1px solid var(--border-1, #e0e0e0);
}

.ag-theme-alpine {
  width: 100%;
  flex: 1;
  min-height: 0;
}

/* Column lines */
:deep(.ag-cell) {
  border-right: 1px solid var(--border-1);
}



:deep(.ag-header-cell) {
  border-right: 1px solid var(--border-2);
}

/* Taller header to accommodate wrapping.
   AG Grid defaults .ag-header to 26px with overflow:hidden, which clips our 48px header row.
   Must override all three properties to prevent clipping. */
:deep(.ag-header) {
  min-height: 48px !important;
  height: auto !important;
  overflow: visible !important;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

:deep(.ag-header-cell-text) {
  color: white;
  font-weight: 600;
}

:deep(.ag-header-viewport),
:deep(.ag-header-container) {
  min-height: 48px;
}

:deep(.ag-header-row) {
  height: 48px !important;
}

:deep(.ag-header-cell) {
  height: 48px !important;
  padding-top: 6px;
  padding-bottom: 6px;
}

/* Override AG Grid's default ellipsis behavior for time columns */
:deep(.ag-cell[col-id="startTime"]),
:deep(.ag-cell[col-id="endTime"]) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  justify-content: flex-end !important;
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

/* Header filter (magnify) icon: theme default can be low-contrast on purple gradient. */
:deep(.ag-header-cell-filter-button) {
  color: rgba(255, 255, 255, 0.95);
}
:deep(.ag-header-cell-filter-button .ag-icon) {
  color: inherit;
  opacity: 0.92;
}
:deep(.ag-header-cell-filter-button:hover .ag-icon) {
  opacity: 1;
}

</style>
