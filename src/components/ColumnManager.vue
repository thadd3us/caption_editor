<template>
  <div class="column-manager" ref="containerRef">
    <button
      class="column-manager-btn tooltip-btn"
      data-tooltip="Manage columns"
      @click="togglePanel"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <rect x="1" y="1" width="4" height="14" rx="1" opacity="0.9" />
        <rect x="6" y="1" width="4" height="14" rx="1" opacity="0.6" />
        <rect x="11" y="1" width="4" height="14" rx="1" opacity="0.3" />
      </svg>
      <span class="btn-label">Columns</span>
    </button>

    <div v-if="isPanelOpen" class="column-panel">
      <div class="panel-header">
        <span class="panel-title">Columns</span>
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

// Columns that should not appear in the manager (e.g. actions)
const EXCLUDED_COLS = new Set(['actions'])

interface ManagedColumn {
  colId: string
  headerName: string
  hide: boolean
}

const managedColumns = computed<ManagedColumn[]>(() => {
  if (!props.gridApi) return []

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
      }
    })
})

function refreshState() {
  if (!props.gridApi) return
  columnStates.value = props.gridApi.getColumnState()
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

function resetToDefaults() {
  if (!props.gridApi) return
  props.gridApi.resetColumnState()
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
  background: var(--surface-1);
  border: 1px solid var(--border-1);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-2);
  transition: background 0.15s, border-color 0.15s;
}

.column-manager-btn:hover {
  background: var(--surface-hover);
  border-color: var(--border-2);
  color: var(--text-1);
}

.btn-label {
  font-weight: 500;
}

.column-panel {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  width: 240px;
  max-height: 400px;
  background: var(--surface-popover);
  border: 1px solid var(--border-1);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-1);
  background: var(--surface-1);
}

.panel-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-1);
}

.reset-btn {
  padding: 3px 8px;
  font-size: 12px;
  background: none;
  border: 1px solid var(--border-1);
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-2);
  transition: background 0.15s;
}

.reset-btn:hover {
  background: var(--surface-hover);
}

.panel-body {
  overflow-y: auto;
  padding: 6px 0;
}

.column-row {
  padding: 6px 12px;
}

.column-row:hover {
  background: var(--surface-hover);
}

.visibility-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-1);
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
</style>
