<template>
  <div v-if="isVisible" class="dialog-overlay" @click.self="handleCancel">
    <div class="dialog-box">
      <div class="dialog-header">
        <h3>Replace Existing Captions?</h3>
      </div>

      <div class="dialog-content">
        <p>
          <strong>Warning:</strong> This will delete all existing caption segments
          and replace them with new captions from the speech recognizer.
        </p>
        <p>This action cannot be undone. Do you want to proceed?</p>
      </div>

      <div class="dialog-footer">
        <button class="dialog-button dialog-button-cancel" @click="handleCancel">
          Cancel
        </button>
        <button class="dialog-button dialog-button-confirm" @click="handleConfirm">
          Replace Captions
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
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
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.dialog-box {
  background: #2d2d2d;
  border-radius: 8px;
  width: 90%;
  max-width: 500px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.dialog-header {
  padding: 20px 24px 16px;
  border-bottom: 1px solid #444;
}

.dialog-header h3 {
  margin: 0;
  color: #fff;
  font-size: 18px;
  font-weight: 600;
}

.dialog-content {
  padding: 20px 24px;
  color: #ddd;
  line-height: 1.5;
}

.dialog-content p {
  margin: 0 0 12px 0;
}

.dialog-content p:last-child {
  margin-bottom: 0;
}

.dialog-content strong {
  color: #ff9800;
}

.dialog-footer {
  padding: 16px 24px;
  border-top: 1px solid #444;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.dialog-button {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.dialog-button-cancel {
  background: #555;
  color: #fff;
}

.dialog-button-cancel:hover {
  background: #666;
}

.dialog-button-confirm {
  background: #d32f2f;
  color: #fff;
}

.dialog-button-confirm:hover {
  background: #c62828;
}
</style>
