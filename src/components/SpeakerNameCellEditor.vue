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
import { ref, computed, nextTick, watch } from 'vue'
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

// Debug logging for macOS troubleshooting
console.log('[SpeakerNameCellEditor] Component created with initial value:', props.params.value)

// Watch editValue changes
watch(editValue, (newVal, oldVal) => {
  console.log('[SpeakerNameCellEditor] editValue changed:', { oldVal, newVal })
})

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
  console.log('[SpeakerNameCellEditor] keydown event:', {
    key: event.key,
    currentEditValue: editValue.value,
    inputElementValue: inputRef.value?.value,
    shouldStop: shouldStop.value
  })

  // Stop propagation of arrow keys so they work within the input
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    event.stopPropagation()
  }

  // Enter key accepts the current value and stops editing
  if (event.key === 'Enter') {
    console.log('[SpeakerNameCellEditor] Enter key pressed')
    console.log('[SpeakerNameCellEditor] Before preventDefault - editValue:', editValue.value)
    console.log('[SpeakerNameCellEditor] Before preventDefault - input.value:', inputRef.value?.value)

    event.preventDefault()  // Prevent default form submission behavior
    event.stopPropagation() // Stop AG Grid from handling this
    shouldStop.value = true

    console.log('[SpeakerNameCellEditor] After preventDefault - editValue:', editValue.value)
    console.log('[SpeakerNameCellEditor] After preventDefault - input.value:', inputRef.value?.value)
    console.log('[SpeakerNameCellEditor] Scheduling stopEditing with setTimeout(0)')

    // On macOS, we need a small delay to ensure v-model has updated
    // before we stop editing and AG Grid calls getValue()
    setTimeout(() => {
      console.log('[SpeakerNameCellEditor] In setTimeout callback - editValue:', editValue.value)
      console.log('[SpeakerNameCellEditor] In setTimeout callback - input.value:', inputRef.value?.value)
      console.log('[SpeakerNameCellEditor] Calling stopEditing()')
      props.params.stopEditing()
    }, 0)
  }

  // Escape key cancels editing
  if (event.key === 'Escape') {
    console.log('[SpeakerNameCellEditor] Escape key pressed - canceling edit')
    event.preventDefault()
    event.stopPropagation()
    editValue.value = props.params.value || ''
    shouldStop.value = true
    props.params.stopEditing()
  }

  // Tab key accepts current value and moves to next cell
  if (event.key === 'Tab') {
    console.log('[SpeakerNameCellEditor] Tab key pressed')
    shouldStop.value = true
    // Let AG Grid handle tab navigation naturally
  }
}

// Handle blur - accept current value when focus is lost
function handleBlur() {
  console.log('[SpeakerNameCellEditor] blur event - shouldStop:', shouldStop.value)
  if (!shouldStop.value) {
    console.log('[SpeakerNameCellEditor] Blur triggered stopEditing - editValue:', editValue.value)
    shouldStop.value = true
    props.params.stopEditing()
  }
}

// Required by AG Grid: Return the final value
function getValue() {
  const trimmedValue = editValue.value.trim()
  console.log('[SpeakerNameCellEditor] getValue() called')
  console.log('[SpeakerNameCellEditor] editValue.value:', editValue.value)
  console.log('[SpeakerNameCellEditor] trimmed value:', trimmedValue)
  console.log('[SpeakerNameCellEditor] input element value:', inputRef.value?.value)
  return trimmedValue
}

// Called after the editor is rendered - focus the input
// AG Grid calls this after the component is attached to the DOM
function afterGuiAttached() {
  console.log('[SpeakerNameCellEditor] afterGuiAttached() called')

  // Use a more robust approach for cross-platform focus:
  // 1. nextTick ensures Vue has finished rendering
  // 2. requestAnimationFrame ensures browser has painted
  // 3. This works reliably on both macOS and Linux
  nextTick(() => {
    console.log('[SpeakerNameCellEditor] In nextTick')
    requestAnimationFrame(() => {
      console.log('[SpeakerNameCellEditor] In requestAnimationFrame')
      if (inputRef.value) {
        console.log('[SpeakerNameCellEditor] Focusing and selecting input')
        inputRef.value.focus()
        inputRef.value.select()
        console.log('[SpeakerNameCellEditor] Input focused, activeElement:', document.activeElement === inputRef.value)
      } else {
        console.log('[SpeakerNameCellEditor] WARNING: inputRef.value is null!')
      }
    })
  })
}

// Tell AG Grid whether to cancel the edit
// These are called before getValue() to determine if edit should be cancelled
function isCancelBeforeStart() {
  console.log('[SpeakerNameCellEditor] isCancelBeforeStart() called, returning false')
  return false
}

function isCancelAfterEnd() {
  console.log('[SpeakerNameCellEditor] isCancelAfterEnd() called, returning false')
  return false
}

// Expose methods required by AG Grid
console.log('[SpeakerNameCellEditor] About to defineExpose with methods:', {
  getValue: typeof getValue,
  afterGuiAttached: typeof afterGuiAttached,
  isCancelBeforeStart: typeof isCancelBeforeStart,
  isCancelAfterEnd: typeof isCancelAfterEnd
})

defineExpose({
  getValue,
  afterGuiAttached,
  isCancelBeforeStart,
  isCancelAfterEnd
})

console.log('[SpeakerNameCellEditor] defineExpose called')
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
