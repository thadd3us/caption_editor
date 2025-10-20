<template>
  <div class="caption-table">
    <div class="table-header">
      <h2>Captions ({{ store.document.cues.length }})</h2>
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
        params.node.setDataValue('startTimeFormatted', formatTimestamp(params.data.startTime))
      }
    }
  },
  {
    field: 'endTimeFormatted',
    colId: 'endTime',
    headerName: 'End',
    width: 120,
    editable: true,
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
        params.node.setDataValue('endTimeFormatted', formatTimestamp(params.data.endTime))
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
    width: 150,
    cellRenderer: StarRatingCell,
  },
  {
    field: 'actions',
    headerName: 'Actions',
    width: 180,
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
    console.log('Selected cue:', cueId)
    store.selectCue(cueId)
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
      gridApi.value.ensureNodeVisible(rowNode, 'middle')
      rowNode.setSelected(true)
      console.log('Row selected and scrolled:', cueId)
    }
  }
}

onMounted(() => {
  window.addEventListener('jumpToRow', handleJumpToRow)
})

onUnmounted(() => {
  window.removeEventListener('jumpToRow', handleJumpToRow)
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
}

.table-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.ag-theme-alpine {
  width: 100%;
}
</style>
