<template>
  <div v-if="isOpen" class="dialog-overlay" @click="handleOverlayClick">
    <div class="dialog-box" @click.stop>
      <h2>Rename Speaker</h2>

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

      <div class="button-group">
        <button @click="handleCancel" class="btn btn-cancel">
          Cancel
        </button>
        <button
          @click="handleRename"
          class="btn btn-rename"
          :disabled="!canRename"
        >
          Rename
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useVTTStore } from '../stores/vttStore'

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

// Can only rename if both fields are filled and different
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

function handleOverlayClick() {
  handleCancel()
}

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
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.dialog-box {
  background: white;
  border-radius: 8px;
  padding: 24px;
  min-width: 400px;
  max-width: 500px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

h2 {
  margin: 0 0 20px 0;
  font-size: 20px;
  font-weight: 600;
  color: #2c3e50;
}

.form-group {
  margin-bottom: 20px;
}

label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #2c3e50;
  font-size: 14px;
}

.speaker-dropdown,
.name-input {
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  border: 1px solid #ddd;
  border-radius: 4px;
  box-sizing: border-box;
  font-family: inherit;
}

.speaker-dropdown:focus,
.name-input:focus {
  outline: none;
  border-color: #3498db;
  box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
}

.speaker-dropdown {
  cursor: pointer;
  background: white;
}

.name-input::placeholder {
  color: #999;
}

.button-group {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
}

.btn {
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-cancel {
  background: #e0e0e0;
  color: #333;
}

.btn-cancel:hover {
  background: #d0d0d0;
}

.btn-rename {
  background: #3498db;
  color: white;
}

.btn-rename:hover:not(:disabled) {
  background: #2980b9;
}

.btn-rename:disabled {
  background: #bdc3c7;
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
