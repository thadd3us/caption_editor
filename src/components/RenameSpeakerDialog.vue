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
import { useVTTStore } from '../stores/vttStore'
import BaseModal from './BaseModal.vue'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  close: []
  rename: [{ oldName: string; newName: string }]
}>()

const store = useVTTStore()

const selectedSpeaker = ref('')
const newName = ref('')

// Compute unique non-empty speaker names from all cues
const uniqueSpeakers = computed(() => {
  const speakers = new Set<string>()
  for (const cue of store.document.segments) {
    if (cue.speakerName && cue.speakerName.trim() !== '') {
      speakers.add(cue.speakerName)
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
  color: #bbb;
  font-size: 14px;
}

.speaker-dropdown,
.name-input {
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  background: #1e1e1e;
  border: 1px solid #444;
  border-radius: 6px;
  color: #eee;
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
  color: #666;
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
  background: #444;
  color: #fff;
}

.dialog-button-secondary:hover {
  background: #555;
}

.dialog-button-primary {
  background: #3a7afe;
  color: #fff;
}

.dialog-button-primary:hover:not(:disabled) {
  background: #4d8dfa;
}

.dialog-button-primary:disabled {
  background: #333;
  color: #666;
  cursor: not-allowed;
}
</style>
