<template>
  <div class="action-buttons">
    <button @click="playSnippet" class="action-btn" title="Play snippet">
      ▶️
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useVTTStore } from '../stores/vttStore'

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
const store = useVTTStore()

// Support both AG Grid (params.data) and direct usage (data)
const rowData = computed(() => props.params?.data || props.data)

function playSnippet() {
  if (!rowData.value) return
  console.log('Playing snippet:', rowData.value.id)
  store.setSnippetMode(true)
  store.setCurrentTime(rowData.value.startTime)
  store.setPlaying(true)
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
  border: 1px solid #ddd;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.action-btn:hover {
  background: #f0f0f0;
  border-color: #999;
}
</style>
