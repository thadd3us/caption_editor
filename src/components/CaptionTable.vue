<template>
  <div class="caption-table">
    <div class="table-header">
      <h2>Captions ({{ store.document.cues.length }})</h2>
      <label class="autoplay-checkbox">
        <input type="checkbox" v-model="autoplayEnabled" />
        Autoplay (selected row)
      </label>
    </div>
    <ag-grid-vue
      class="ag-theme-alpine"
      :key="gridKey"
      :rowData="rowData"
      :columnDefs="columnDefs"
      :defaultColDef="defaultColDef"
      :rowSelection="'single'"
      :getRowId="getRowId"
      :immutableData="true"
      @grid-ready="onGridReady"
      @selection-changed="onSelectionChanged"
      @row-clicked="onRowClicked"
      :domLayout="'normal'"
      style="height: calc(100% - 60px);"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { AgGridVue } from 'ag-grid-vue3'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'
import type { ColDef, GridApi, GridReadyEvent, SelectionChangedEvent, RowClickedEvent } from 'ag-grid-community'
import { useVTTStore } from '../stores/vttStore'
import { formatTimestamp } from '../utils/vttParser'
import StarRatingCell from './StarRatingCell.vue'
import ActionButtonsCell from './ActionButtonsCell.vue'

const store = useVTTStore()
const gridApi = ref<GridApi | null>(null)
const autoplayEnabled = ref(false)

// Force grid re-render when cues array changes
const gridKey = computed(() => store.document.cues.map(c => c.id).join(','))

const rowData = computed(() => {
  // Cues are always kept sorted in the document model
  return store.document.cues.map(cue => ({
    id: cue.id,
    startTime: cue.startTime,
    endTime: cue.endTime,
    startTimeFormatted: formatTimestamp(cue.startTime),
    endTimeFormatted: formatTimestamp(cue.endTime),
    text: cue.text,
    rating: cue.rating
  }))
})

const columnDefs = ref<ColDef[]>([
  {
    field: 'startTimeFormatted',
    colId: 'startTime',
    headerName: 'Start',
    width: 120,
    editable: true,
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
        // Parse and validate
        const timestamp = params.newValue
        // Simple validation - the parser will do the full validation
        if (!timestamp.match(/^\d{2}:\d{2}:\d{2}\.\d{3}$/)) {
          throw new Error('Invalid format. Use HH:MM:SS.mmm')
        }

        // Convert to seconds and update
        const parts = timestamp.split(':')
        const seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2])

        store.updateCue(params.data.id, { startTime: seconds })
      } catch (err) {
        alert('Invalid start time: ' + (err instanceof Error ? err.message : 'Unknown error'))
        params.node?.setDataValue('startTimeFormatted', formatTimestamp(params.data.startTime))
      }
    }
  },
  {
    field: 'endTimeFormatted',
    colId: 'endTime',
    headerName: 'End',
    width: 120,
    editable: true,
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
        const timestamp = params.newValue
        if (!timestamp.match(/^\d{2}:\d{2}:\d{2}\.\d{3}$/)) {
          throw new Error('Invalid format. Use HH:MM:SS.mmm')
        }

        const parts = timestamp.split(':')
        const seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2])

        store.updateCue(params.data.id, { endTime: seconds })
      } catch (err) {
        alert('Invalid end time: ' + (err instanceof Error ? err.message : 'Unknown error'))
        params.node?.setDataValue('endTimeFormatted', formatTimestamp(params.data.endTime))
      }
    }
  },
  {
    field: 'text',
    headerName: 'Caption',
    flex: 1,
    editable: true,
    cellEditor: 'agLargeTextCellEditor',
    cellEditorParams: {
      maxLength: 500,
      rows: 4,
      cols: 50
    },
    onCellValueChanged: (params) => {
      console.log('Caption text edited:', params.newValue)
      store.updateCue(params.data.id, { text: params.newValue })
    }
  },
  {
    field: 'rating',
    headerName: 'Rating',
    width: 120,
    cellRenderer: StarRatingCell,
  },
  {
    field: 'actions',
    headerName: 'Actions',
    width: 120,
    cellRenderer: ActionButtonsCell,
    sortable: false,
    filter: false
  }
])

const defaultColDef = ref<ColDef>({
  sortable: false,  // Disable sorting by default; only time columns are sortable
  filter: true,
  resizable: true
})

function getRowId(params: { data: { id: string } }) {
  return params.data.id
}

function onGridReady(params: GridReadyEvent) {
  console.log('AG Grid ready')
  gridApi.value = params.api
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
    const startTime = row.startTime
    console.log('Selected cue:', cueId)
    store.selectCue(cueId)

    // If autoplay is enabled, play from this row
    if (autoplayEnabled.value) {
      console.log('Autoplay enabled, playing from:', startTime)
      store.setCurrentTime(startTime)
      const mediaElement = document.querySelector('audio, video') as HTMLMediaElement
      if (mediaElement) {
        mediaElement.currentTime = startTime
        mediaElement.play().catch(err => console.error('Autoplay failed:', err))
      }
    }
  }
}

// Update grid when cues change
watch(() => store.document.cues, () => {
  gridApi.value?.refreshCells()
}, { deep: true })

// Handle jumpToRow event from MediaPlayer
function handleJumpToRow(event: Event) {
  const customEvent = event as CustomEvent
  const { cueId } = customEvent.detail
  console.log('Jump to row event received:', cueId)

  if (cueId && gridApi.value) {
    const rowNode = gridApi.value.getRowNode(cueId)
    if (rowNode) {
      gridApi.value.deselectAll()  // Clear any previous selection first
      gridApi.value.ensureNodeVisible(rowNode, 'middle')
      rowNode.setSelected(true)
      console.log('Row selected and scrolled:', cueId)
    } else {
      console.warn('Could not find row node for cue ID:', cueId)
    }
  }
}

// Handle keyboard navigation with arrow keys and space
function handleKeyDown(event: KeyboardEvent) {
  if (!gridApi.value) return

  const selectedRows = gridApi.value.getSelectedRows()
  if (selectedRows.length === 0) return

  const currentRow = selectedRows[0]
  const allRows = rowData.value

  const currentIndex = allRows.findIndex(r => r.id === currentRow.id)
  if (currentIndex === -1) return

  let newIndex = currentIndex

  // Arrow key navigation
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    newIndex = Math.min(currentIndex + 1, allRows.length - 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    newIndex = Math.max(currentIndex - 1, 0)
  } else if (event.key === ' ' || event.key === 'Spacebar') {
    // Space key toggles play/pause if autoplay is enabled
    if (autoplayEnabled.value) {
      event.preventDefault()
      const mediaElement = document.querySelector('audio, video') as HTMLMediaElement
      if (mediaElement) {
        if (mediaElement.paused) {
          mediaElement.play().catch(err => console.error('Play failed:', err))
        } else {
          mediaElement.pause()
        }
      }
    }
    return
  } else {
    return
  }

  // Select the new row
  if (newIndex !== currentIndex) {
    const newRow = allRows[newIndex]
    const rowNode = gridApi.value.getRowNode(newRow.id)
    if (rowNode) {
      gridApi.value.deselectAll()
      gridApi.value.ensureNodeVisible(rowNode, 'middle')
      rowNode.setSelected(true)
    }
  }
}

onMounted(() => {
  window.addEventListener('jumpToRow', handleJumpToRow)
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('jumpToRow', handleJumpToRow)
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<style scoped>
.caption-table {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 10px;
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

.autoplay-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #555;
  cursor: pointer;
  user-select: none;
}

.autoplay-checkbox input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.ag-theme-alpine {
  width: 100%;
}
</style>
