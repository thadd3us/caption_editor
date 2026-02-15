<template>
  <BaseModal
    :is-open="isOpen"
    title="Rename Speaker"
    max-width="450px"
    @close="handleCancel"
  >
    <div class="form-group">
      <label for="speaker-select">Select Speaker:</label>
      <select
        id="speaker-select"
        v-model="selectedSpeaker"
        class="speaker-dropdown"
      >
        <option value="" disabled>Choose a speaker...</option>
        <option
          v-for="speaker in uniqueSpeakers"
          :key="speaker"
          :value="speaker"
        >
          {{ speaker }}
        </option>
      </select>
    </div>

    <div class="form-group">
      <label for="new-name-input">New Name:</label>
      <input
        id="new-name-input"
        v-model="newName"
        type="text"
        class="name-input"
        placeholder="Enter new speaker name..."
        @keydown.enter="handleRename"
      />
    </div>

    <template #footer>
      <button class="dialog-button dialog-button-secondary" @click="handleCancel">
        Cancel
      </button>
      <button
        class="dialog-button dialog-button-primary"
        :disabled="!canRename"
        @click="handleRename"
      >
        Rename
      </button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useCaptionStore } from '../stores/captionStore'
import BaseModal from './BaseModal.vue'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  close: []
  rename: [{ oldName: string; newName: string }]
}>()

const store = useCaptionStore()

const selectedSpeaker = ref('')
const newName = ref('')

// Compute unique non-empty speaker names from all segments
const uniqueSpeakers = computed(() => {
  const speakers = new Set<string>()
  for (const segment of store.document.segments) {
    if (segment.speakerName && segment.speakerName.trim() !== '') {
      speakers.add(segment.speakerName)
    }
  }
  return Array.from(speakers).sort()
})

// Can only rename if speaker is selected and new name is different
const canRename = computed(() => {
  return selectedSpeaker.value !== '' &&
         newName.value.trim() !== '' &&
         newName.value.trim() !== selectedSpeaker.value
})

// Reset form when dialog opens
watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    selectedSpeaker.value = ''
    newName.value = ''
  }
})

function handleCancel() {
  emit('close')
}

function handleRename() {
  if (!canRename.value) return

  emit('rename', {
    oldName: selectedSpeaker.value,
    newName: newName.value.trim()
  })
  emit('close')
}
</script>

<style scoped>
.form-group {
  margin-bottom: 20px;
}

label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: var(--text-2);
  font-size: 14px;
}

.speaker-dropdown,
.name-input {
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 6px;
  color: var(--input-text);
  box-sizing: border-box;
  font-family: inherit;
}

.speaker-dropdown:focus,
.name-input:focus {
  outline: none;
  border-color: #3a7afe;
  box-shadow: 0 0 0 3px rgba(58, 122, 254, 0.2);
}

.name-input::placeholder {
  color: var(--input-placeholder);
}

.dialog-button {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.dialog-button-secondary {
  background: var(--btn-secondary-bg);
  color: var(--btn-secondary-text);
}

.dialog-button-secondary:hover {
  background: var(--btn-secondary-hover-bg);
}

.dialog-button-primary {
  background: #3a7afe;
  color: #fff;
}

.dialog-button-primary:hover:not(:disabled) {
  background: #4d8dfa;
}

.dialog-button-primary:disabled {
  background: var(--btn-disabled-bg);
  color: var(--btn-disabled-text);
  cursor: not-allowed;
}
</style>
