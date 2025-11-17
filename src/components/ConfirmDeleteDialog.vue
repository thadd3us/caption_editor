<template>
  <div v-if="isOpen" class="dialog-overlay" @click="handleOverlayClick">
    <div class="dialog-box" @click.stop>
      <h2>Delete Selected Rows</h2>

      <div class="warning-text">
        Are you sure you want to delete {{ rowCount }} row{{ rowCount === 1 ? '' : 's' }}?
        This action cannot be undone.
      </div>

      <div class="button-group">
        <button @click="handleCancel" class="btn btn-cancel">
          Cancel
        </button>
        <button
          @click="handleConfirm"
          class="btn btn-delete"
        >
          Delete
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  isOpen: boolean
  rowCount: number
}>()

const emit = defineEmits<{
  close: []
  confirm: []
}>()

function handleOverlayClick() {
  handleCancel()
}

function handleCancel() {
  emit('close')
}

function handleConfirm() {
  emit('confirm')
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

.warning-text {
  margin-bottom: 24px;
  font-size: 14px;
  color: #555;
  background: #fff3cd;
  padding: 12px;
  border-radius: 4px;
  border-left: 3px solid #ff9800;
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

.btn-delete {
  background: #d32f2f;
  color: white;
}

.btn-delete:hover {
  background: #b71c1c;
}
</style>
