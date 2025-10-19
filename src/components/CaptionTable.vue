<template>
  <div class="caption-table">
    <div class="table-header">
      <h2>Captions ({{ store.sortedCues.length }})</h2>
    </div>
    <ag-grid-vue
      class="ag-theme-alpine"
      :rowData="rowData"
      :columnDefs="columnDefs"
      :defaultColDef="defaultColDef"
      :rowSelection="'single'"
      @grid-ready="onGridReady"
      @selection-changed="onSelectionChanged"
      :domLayout="'normal'"
      style="height: calc(100% - 60px);"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { AgGridVue } from 'ag-grid-vue3'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'
import type { ColDef, GridApi, GridReadyEvent, SelectionChangedEvent } from 'ag-grid-community'
import { useVTTStore } from '../stores/vttStore'
import { formatTimestamp } from '../utils/vttParser'
import StarRatingCell from './StarRatingCell.vue'
import ActionButtonsCell from './ActionButtonsCell.vue'

const store = useVTTStore()
const gridApi = ref<GridApi | null>(null)

const rowData = computed(() => {
  return store.sortedCues.map(cue => ({
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
  sortable: true,
  filter: true,
  resizable: true
})

function onGridReady(params: GridReadyEvent) {
  console.log('AG Grid ready')
  gridApi.value = params.api
}

function onSelectionChanged(event: SelectionChangedEvent) {
  const selectedRows = event.api.getSelectedRows()
  if (selectedRows.length > 0) {
    const cueId = selectedRows[0].id
    console.log('Selected cue:', cueId)
    store.selectCue(cueId)
  }
}

// Auto-scroll to current cue
watch(() => store.currentCue, (cue) => {
  if (cue && gridApi.value) {
    const rowNode = gridApi.value.getRowNode(cue.id)
    if (rowNode) {
      gridApi.value.ensureNodeVisible(rowNode, 'middle')
      rowNode.setSelected(true)
    }
  }
})

// Update grid when cues change
watch(() => store.sortedCues, () => {
  gridApi.value?.refreshCells()
}, { deep: true })
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
