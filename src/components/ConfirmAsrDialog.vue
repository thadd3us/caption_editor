<template>
  <BaseModal
    :is-open="isVisible"
    title="Replace Existing Captions?"
    max-width="500px"
    @close="handleCancel"
  >
    <div class="dialog-content">
      <p>
        <strong class="warning-text">Warning:</strong> This will delete all existing caption segments
        and replace them with new captions from the speech recognizer.
      </p>
      <p>This action cannot be undone. Do you want to proceed?</p>
    </div>

    <template #footer>
      <button class="dialog-button dialog-button-secondary" @click="handleCancel">
        Cancel
      </button>
      <button class="dialog-button dialog-button-danger" @click="handleConfirm">
        Replace Captions
      </button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import BaseModal from './BaseModal.vue'

defineProps<{
  isVisible: boolean
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

function handleConfirm() {
  emit('confirm')
}

function handleCancel() {
  emit('cancel')
}
</script>

<style scoped>
.dialog-content {
  color: var(--text-1);
}

.warning-text {
  color: #ff9800;
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

.dialog-button-danger {
  background: #d32f2f;
  color: #fff;
}

.dialog-button-danger:hover {
  background: #c62828;
}
</style>
