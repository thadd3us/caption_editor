<template>
  <div v-if="isOpen" class="dialog-overlay" @click="handleOverlayClick">
    <div class="dialog-box" @click.stop>
      <h2>Bulk Set Speaker</h2>

      <div class="info-text">
        Set the speaker name for {{ rowCount }} selected row{{ rowCount === 1 ? '' : 's' }}
      </div>

      <div class="form-group">
        <label for="speaker-name-input">Speaker Name:</label>
        <input
          id="speaker-name-input"
          v-model="speakerName"
          type="text"
          class="name-input"
          placeholder="Enter speaker name..."
          @keydown.enter="handleSetSpeaker"
          ref="inputRef"
        />
      </div>

      <div class="button-group">
        <button @click="handleCancel" class="btn btn-cancel">
          Cancel
        </button>
        <button
          @click="handleSetSpeaker"
          class="btn btn-set"
          :disabled="!canSetSpeaker"
        >
          Set Speaker
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'

const props = defineProps<{
  isOpen: boolean
  rowCount: number
}>()

const emit = defineEmits<{
  close: []
  setSpeaker: [{ speakerName: string }]
}>()

const speakerName = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

// Can only set speaker if name is non-empty
const canSetSpeaker = computed(() => {
  return speakerName.value.trim() !== ''
})

// Reset form when dialog opens and focus input
watch(() => props.isOpen, async (isOpen) => {
  if (isOpen) {
    speakerName.value = ''
    // Focus the input field after the dialog is rendered
    await nextTick()
    inputRef.value?.focus()
  }
})

function handleOverlayClick() {
  handleCancel()
}

function handleCancel() {
  emit('close')
}

function handleSetSpeaker() {
  if (!canSetSpeaker.value) return

  emit('setSpeaker', {
    speakerName: speakerName.value.trim()
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
  margin: 0 0 16px 0;
  font-size: 20px;
  font-weight: 600;
  color: #2c3e50;
}

.info-text {
  margin-bottom: 20px;
  font-size: 14px;
  color: #555;
  background: #f8f9fa;
  padding: 10px 12px;
  border-radius: 4px;
  border-left: 3px solid #3498db;
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

.name-input {
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  border: 1px solid #ddd;
  border-radius: 4px;
  box-sizing: border-box;
  font-family: inherit;
}

.name-input:focus {
  outline: none;
  border-color: #3498db;
  box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
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

.btn-set {
  background: #3498db;
  color: white;
}

.btn-set:hover:not(:disabled) {
  background: #2980b9;
}

.btn-set:disabled {
  background: #bdc3c7;
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
