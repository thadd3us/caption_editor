<template>
  <div class="action-buttons">
    <button @click="playSnippet" class="action-btn" title="Play snippet">
      ▶️
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useCaptionStore } from '../stores/captionStore'

interface Props {
  params?: {
    data: {
      id: string
      startTime: number
      endTime: number
    }
  }
  data?: {
    id: string
    startTime: number
    endTime: number
  }
}

const props = defineProps<Props>()
const store = useCaptionStore()

// Support both AG Grid (params.data) and direct usage (data)
const rowData = computed(() => props.params?.data || props.data)

function playSnippet() {
  if (!rowData.value) return
  console.log('Playing segment:', rowData.value.id)
  // Create a playlist of just this one segment
  store.startPlaylistPlayback([rowData.value.id], 0)
}
</script>

<style scoped>
.action-buttons {
  display: flex;
  gap: 6px;
  padding: 4px 0;
}

.action-btn {
  padding: 4px 8px;
  border: 1px solid var(--border-1);
  background: var(--surface-2);
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.action-btn:hover {
  background: var(--surface-hover);
  border-color: var(--border-2);
}
</style>
