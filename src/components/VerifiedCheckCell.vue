<template>
  <div class="verified-check" @click.stop="handleClick">
    <span class="check-icon" :class="{ verified: isVerified }">
      {{ isVerified ? '✅' : '⬜' }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useCaptionStore } from '../stores/captionStore'

interface Props {
  params?: {
    data: {
      id: string
      verified?: boolean
    }
    api?: any
  }
}

const props = defineProps<Props>()
const store = useCaptionStore()

const rowData = computed(() => props.params?.data)
const isVerified = computed(() => rowData.value?.verified === true)

function handleClick() {
  if (!rowData.value || !props.params?.api) return

  const newValue = !isVerified.value
  const gridApi = props.params.api

  // Get all selected nodes
  const selectedNodes = gridApi.getSelectedNodes() || []

  // If this row is among selected rows and multiple are selected, apply to all
  const selectedIds = selectedNodes.map((n: any) => n.data?.id).filter(Boolean)
  if (selectedIds.length > 1 && selectedIds.includes(rowData.value.id)) {
    store.bulkSetVerified(selectedIds, newValue)
  } else {
    store.updateSegment(rowData.value.id, { verified: newValue || undefined })
  }
}
</script>

<style scoped>
.verified-check {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  user-select: none;
  width: 100%;
  height: 100%;
}

.check-icon {
  font-size: 18px;
  transition: opacity 0.15s;
}

.check-icon:not(.verified) {
  opacity: 0.3;
}

.check-icon:not(.verified):hover {
  opacity: 0.7;
}
</style>
