<template>
  <div
    class="verified-check tooltip-btn"
    data-tooltip="Mark this caption as verified (or for every row you are targeting in the current selection)"
    title="Mark this caption as verified (or for every row you are targeting in the current selection)"
    @click.stop="handleClick"
  >
    <span class="check-icon" :class="{ verified: isVerified }">
      {{ isVerified ? '✅' : '⬜' }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useCaptionStore } from '../stores/captionStore'
import { resolveRowActionTargetRows } from '../utils/rowActionTarget'

interface Props {
  params?: {
    data: {
      id: string
      verified?: boolean
    }
    api?: any
    node?: any
  }
}

const props = defineProps<Props>()
const store = useCaptionStore()

const rowData = computed(() => props.params?.data)
const isVerified = computed(() => rowData.value?.verified === true)

function handleClick() {
  if (!rowData.value) return

  const newValue = !isVerified.value
  const gridApi = props.params?.api
  const node = props.params?.node

  if (!gridApi || !node) {
    store.updateSegment(rowData.value.id, { verified: newValue || undefined })
    return
  }

  const ids = resolveRowActionTargetRows(gridApi, node)
    .map((r) => r.id)
    .filter(Boolean) as string[]
  if (ids.length === 0) return
  store.bulkSetVerified(ids, newValue)
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
