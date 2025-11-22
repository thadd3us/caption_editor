<template>
  <div class="speaker-name-cell-editor-wrapper">
    <input
      ref="inputRef"
      v-model="editValue"
      type="text"
      :list="datalistId"
      class="speaker-name-editor"
      autocomplete="off"
      @keydown="handleKeyDown"
      @blur="handleBlur"
    />
    <datalist :id="datalistId">
      <option
        v-for="speaker in filteredSpeakers"
        :key="speaker"
        :value="speaker"
      />
    </datalist>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useVTTStore } from '../stores/vttStore'
import type { ICellEditorParams } from 'ag-grid-community'

interface Props {
  params: ICellEditorParams
}

const props = defineProps<Props>()
const store = useVTTStore()

const inputRef = ref<HTMLInputElement | null>(null)
const editValue = ref(props.params.value || '')
const shouldStop = ref(false)

// Generate unique datalist ID
const datalistId = computed(() => `speaker-datalist-${props.params.node.id}`)

// Get all unique speaker names from the document, sorted by frequency (most common first)
const allSpeakers = computed(() => {
  const speakerCounts = new Map<string, number>()

  for (const segment of store.document.segments) {
    if (segment.speakerName && segment.speakerName.trim() !== '') {
      const name = segment.speakerName
      speakerCounts.set(name, (speakerCounts.get(name) || 0) + 1)
    }
  }

  // Sort by frequency (descending), then alphabetically
  return Array.from(speakerCounts.entries())
    .sort((a, b) => {
      // First sort by count (descending)
      const countDiff = b[1] - a[1]
      if (countDiff !== 0) return countDiff
      // Then sort alphabetically
      return a[0].localeCompare(b[0])
    })
    .map(([name]) => name)
})

// AG Grid cell editor: Always show all speakers, let browser handle filtering
// The browser's datalist automatically filters based on user input
const filteredSpeakers = computed(() => {
  return allSpeakers.value
})

// Handle keyboard navigation - allow arrow keys for text editing
function handleKeyDown(event: KeyboardEvent) {
  // Stop propagation of arrow keys so they work within the input
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    event.stopPropagation()
  }

  // Enter key accepts the current value and stops editing
  if (event.key === 'Enter') {
    shouldStop.value = true
    props.params.stopEditing()
  }

  // Escape key cancels editing
  if (event.key === 'Escape') {
    editValue.value = props.params.value || ''
    shouldStop.value = true
    props.params.stopEditing()
  }

  // Tab key accepts current value and moves to next cell
  if (event.key === 'Tab') {
    shouldStop.value = true
    // Let AG Grid handle tab navigation naturally
  }
}

// Handle blur - accept current value when focus is lost
function handleBlur() {
  if (!shouldStop.value) {
    shouldStop.value = true
    props.params.stopEditing()
  }
}

// Required by AG Grid: Return the final value
function getValue() {
  return editValue.value.trim()
}

// Called after the editor is rendered - focus the input
function afterGuiAttached() {
  inputRef.value?.focus()
  inputRef.value?.select()
}

// Expose methods required by AG Grid
defineExpose({
  getValue,
  afterGuiAttached
})

onMounted(() => {
  // Focus and select all text when mounted
  afterGuiAttached()
})
</script>

<style scoped>
.speaker-name-cell-editor-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
}

.speaker-name-editor {
  width: 100%;
  height: 100%;
  padding: 4px 8px;
  border: none;
  outline: none;
  background: white;
  font-family: inherit;
  font-size: inherit;
  box-sizing: border-box;
}

.speaker-name-editor:focus {
  outline: 2px solid #3498db;
  outline-offset: -2px;
}
</style>
