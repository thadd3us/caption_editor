<template>
  <div class="column-manager" ref="containerRef">
    <button
      class="column-manager-btn tooltip-btn"
      data-tooltip="Manage columns & filters"
      @click="togglePanel"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <rect x="1" y="1" width="4" height="14" rx="1" opacity="0.9" />
        <rect x="6" y="1" width="4" height="14" rx="1" opacity="0.6" />
        <rect x="11" y="1" width="4" height="14" rx="1" opacity="0.3" />
      </svg>
      <span class="btn-label">Columns</span>
    </button>

    <div v-if="isPanelOpen" class="column-panel" ref="panelRef">
      <div class="panel-header">
        <span class="panel-title">Columns & Filters</span>
        <button class="reset-btn" @click="resetToDefaults" title="Reset to defaults">↺ Reset</button>
      </div>
      <div class="panel-body">
        <div
          v-for="col in managedColumns"
          :key="col.colId"
          class="column-row"
        >
          <label class="visibility-toggle">
            <input
              type="checkbox"
              :checked="!col.hide"
              @change="toggleVisibility(col.colId, ($event.target as HTMLInputElement).checked)"
            />
            <span class="col-name">{{ col.headerName }}</span>
          </label>
          <div v-if="col.filterable" class="filter-input-wrapper">
            <input
              type="text"
              class="filter-input"
              :placeholder="'Filter ' + col.headerName + '…'"
              :value="getFilterValue(col.colId)"
              @input="onFilterInput(col.colId, ($event.target as HTMLInputElement).value)"
            />
            <button
              v-if="getFilterValue(col.colId)"
              class="clear-filter-btn"
              @click="clearFilter(col.colId)"
              title="Clear filter"
            >×</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { GridApi, ColDef } from 'ag-grid-community'

const props = defineProps<{
  gridApi: GridApi | null
  columnDefs: ColDef[]
}>()

const isPanelOpen = ref(false)
const containerRef = ref<HTMLElement | null>(null)

// Reactive snapshot of column state from grid
const columnStates = ref<any[]>([])
const filterModel = ref<Record<string, any>>({})

// Columns that should not appear in the manager (e.g. actions)
const EXCLUDED_COLS = new Set(['actions'])

// Columns that are not filterable
const NON_FILTERABLE_COLS = new Set(['actions', 'verified', 'rating'])

interface ManagedColumn {
  colId: string
  headerName: string
  hide: boolean
  filterable: boolean
}

const managedColumns = computed<ManagedColumn[]>(() => {
  if (!props.gridApi) return []

  // Build from column defs + current state
  const stateMap = new Map<string, any>()
  for (const cs of columnStates.value) {
    stateMap.set(cs.colId, cs)
  }

  return props.columnDefs
    .filter(cd => !EXCLUDED_COLS.has(cd.field || ''))
    .map(cd => {
      const colId = cd.field || ''
      const state = stateMap.get(colId)
      return {
        colId,
        headerName: cd.headerName || colId,
        hide: state ? !!state.hide : !!cd.hide,
        filterable: !NON_FILTERABLE_COLS.has(colId) && cd.filter !== false
      }
    })
})

function refreshState() {
  if (!props.gridApi) return
  columnStates.value = props.gridApi.getColumnState()
  filterModel.value = props.gridApi.getFilterModel() || {}
}

function togglePanel() {
  isPanelOpen.value = !isPanelOpen.value
  if (isPanelOpen.value) {
    refreshState()
  }
}

function toggleVisibility(colId: string, visible: boolean) {
  if (!props.gridApi) return
  props.gridApi.setColumnsVisible([colId], visible)
  refreshState()
}

function getFilterValue(colId: string): string {
  const filter = filterModel.value[colId]
  if (!filter) return ''
  // AG Grid text filter uses { filter: 'value', type: 'contains' }
  return filter.filter || ''
}

function onFilterInput(colId: string, value: string) {
  if (!props.gridApi) return
  const newModel = { ...props.gridApi.getFilterModel() }
  if (value) {
    newModel[colId] = { type: 'contains', filter: value, filterType: 'text' }
  } else {
    delete newModel[colId]
  }
  props.gridApi.setFilterModel(newModel)
  // Update local state
  filterModel.value = props.gridApi.getFilterModel() || {}
}

function clearFilter(colId: string) {
  onFilterInput(colId, '')
}

function resetToDefaults() {
  if (!props.gridApi) return
  props.gridApi.resetColumnState()
  props.gridApi.setFilterModel({})
  refreshState()
}

// Close panel when clicking outside
function onDocumentClick(e: MouseEvent) {
  if (!isPanelOpen.value) return
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    isPanelOpen.value = false
  }
}

// Refresh state when grid API becomes available
watch(() => props.gridApi, (api) => {
  if (api && isPanelOpen.value) refreshState()
})

onMounted(() => {
  document.addEventListener('click', onDocumentClick, true)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick, true)
})
</script>

<style scoped>
.column-manager {
  position: relative;
  z-index: 100;
}

.column-manager-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--surface-1, #f5f5f5);
  border: 1px solid var(--border-1, #ddd);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-2, #666);
  transition: background 0.15s, border-color 0.15s;
}

.column-manager-btn:hover {
  background: var(--surface-2, #eee);
  border-color: var(--border-2, #ccc);
  color: var(--text-1, #333);
}

.btn-label {
  font-weight: 500;
}

.column-panel {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  width: 300px;
  max-height: 400px;
  background: var(--surface-0, #fff);
  border: 1px solid var(--border-1, #ddd);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-1, #eee);
  background: var(--surface-1, #fafafa);
}

.panel-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-1, #333);
}

.reset-btn {
  padding: 3px 8px;
  font-size: 12px;
  background: none;
  border: 1px solid var(--border-1, #ddd);
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-2, #666);
  transition: background 0.15s;
}

.reset-btn:hover {
  background: var(--surface-2, #eee);
}

.panel-body {
  overflow-y: auto;
  padding: 6px 0;
}

.column-row {
  padding: 6px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.column-row:hover {
  background: var(--surface-1, #f8f8f8);
}

.visibility-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-1, #333);
  user-select: none;
}

.visibility-toggle input[type="checkbox"] {
  width: 15px;
  height: 15px;
  cursor: pointer;
  flex-shrink: 0;
}

.col-name {
  font-weight: 500;
}

.filter-input-wrapper {
  position: relative;
  margin-left: 23px;
}

.filter-input {
  width: 100%;
  padding: 4px 24px 4px 8px;
  font-size: 12px;
  border: 1px solid var(--border-1, #ddd);
  border-radius: 4px;
  background: var(--surface-0, #fff);
  color: var(--text-1, #333);
  outline: none;
  box-sizing: border-box;
}

.filter-input:focus {
  border-color: var(--accent-color, #4a9eff);
}

.filter-input::placeholder {
  color: var(--text-3, #aaa);
}

.clear-filter-btn {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-3, #999);
  padding: 0;
  line-height: 1;
}

.clear-filter-btn:hover {
  color: var(--text-1, #333);
}
</style>
