<template>
  <input
    :id="inputId"
    ref="inputRef"
    v-model="localValue"
    type="text"
    :list="enableDatalist ? datalistId : undefined"
    :placeholder="placeholder"
    :class="inputClass"
    autocomplete="off"
    @input="handleInput"
    @keydown.enter="handleEnter"
    @blur="handleBlur"
  />
  <datalist v-if="enableDatalist" :id="datalistId">
    <option
      v-for="speaker in filteredSpeakers"
      :key="speaker"
      :value="speaker"
    />
  </datalist>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useCaptionStore } from '../stores/captionStore'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    inputClass?: string
    inputId?: string
  }>(),
  {
    placeholder: 'Enter speaker name...',
    inputClass: '',
    inputId: 'speaker-name-input'
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'enter': []
  'blur': []
}>()

const store = useCaptionStore()
const localValue = ref(props.modelValue)
const inputRef = ref<HTMLInputElement | null>(null)

// Generate unique datalist ID to avoid conflicts when multiple instances exist
const datalistId = computed(() => `${props.inputId}-datalist`)

// Playwright+Electron has a known crash bug when interacting with <input list=...> / <datalist>.
// Disable datalist suggestions in E2E tests to keep the renderer stable.
const enableDatalist = computed(() => {
  return !((window as any).electronAPI?.isTest === true)
})

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

// Always show all speakers - the browser's datalist automatically filters
// based on user input. We just provide the sorted list (most common first).
const filteredSpeakers = computed(() => {
  return allSpeakers.value
})

// Watch for external changes to modelValue
watch(() => props.modelValue, (newValue) => {
  localValue.value = newValue
})

function handleInput() {
  emit('update:modelValue', localValue.value)
}

function handleEnter() {
  emit('enter')
}

function handleBlur() {
  emit('blur')
}

// Expose focus method for parent components
function focus() {
  inputRef.value?.focus()
}

defineExpose({
  focus
})
</script>

<style scoped>
/* No styles here - parent component controls styling via inputClass prop */
</style>
