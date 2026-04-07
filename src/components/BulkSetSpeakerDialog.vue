<template>
  <BaseModal
    :is-open="isOpen"
    title="Bulk Set Speaker"
    max-width="450px"
    @close="handleCancel"
  >
    <div class="info-box">
      Set the speaker name for {{ rowCount }} selected row{{ rowCount === 1 ? '' : 's' }}
    </div>

    <div class="form-group">
      <label for="speaker-name-input">Speaker Name:</label>
      <SpeakerNameInput
        ref="inputRef"
        v-model="speakerName"
        input-id="speaker-name-input"
        input-class="name-input"
        placeholder="Enter speaker name..."
        @enter="handleSetSpeaker"
      />
    </div>

    <template #footer>
      <button class="dialog-button dialog-button-secondary" @click="handleCancel">
        Cancel
      </button>
      <button
        class="dialog-button dialog-button-primary"
        :disabled="!canSetSpeaker"
        @click="handleSetSpeaker"
      >
        Set Speaker
      </button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import SpeakerNameInput from './SpeakerNameInput.vue'
import BaseModal from './BaseModal.vue'

const props = defineProps<{
  isOpen: boolean
  rowCount: number
}>()

const emit = defineEmits<{
  close: []
  setSpeaker: [{ speakerName: string }]
}>()

const speakerName = ref('')
const inputRef = ref<InstanceType<typeof SpeakerNameInput> | null>(null)

// Always allow setting speaker (even to empty string)
const canSetSpeaker = computed(() => {
  return true
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

function handleCancel() {
  emit('close')
}

function handleSetSpeaker() {
  // Allow empty string (trim only removes leading/trailing whitespace)
  emit('setSpeaker', {
    speakerName: speakerName.value.trim()
  })
  emit('close')
}
</script>

<style scoped>
.info-box {
  background: var(--info-bg);
  border-left: 4px solid var(--info-border);
  padding: 12px 16px;
  border-radius: 4px;
  color: var(--info-text);
  font-size: 14px;
  margin-bottom: 20px;
}

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

:deep(.name-input) {
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

:deep(.name-input:focus) {
  outline: none;
  border-color: #3498db;
  box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.2);
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
