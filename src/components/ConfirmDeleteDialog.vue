<template>
  <BaseModal
    :is-open="isOpen"
    title="Delete Selected Rows"
    max-width="450px"
    @close="handleCancel"
  >
    <div class="warning-box">
      Are you sure you want to delete {{ rowCount }} row{{ rowCount === 1 ? '' : 's' }}?
      This action cannot be undone.
    </div>

    <template #footer>
      <button class="dialog-button dialog-button-secondary" @click="handleCancel">
        Cancel
      </button>
      <button class="dialog-button dialog-button-danger" @click="handleConfirm">
        Delete
      </button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import BaseModal from './BaseModal.vue'

defineProps<{
  isOpen: boolean
  rowCount: number
}>()

const emit = defineEmits<{
  close: []
  confirm: []
}>()

function handleCancel() {
  emit('close')
}

function handleConfirm() {
  emit('confirm')
  emit('close')
}
</script>

<style scoped>
.warning-box {
  background: var(--danger-bg);
  border-left: 4px solid var(--danger-border);
  padding: 16px;
  border-radius: 4px;
  color: var(--danger-text);
  font-size: 14px;
  line-height: 1.5;
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
