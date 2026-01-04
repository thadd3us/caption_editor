<template>
  <BaseModal 
    :is-open="isOpen" 
    :title="title" 
    :max-width="maxWidth" 
    @close="handleCancel"
  >
    <div class="confirm-content">
      <p v-if="message">{{ message }}</p>
      <slot></slot>
    </div>

    <template #footer>
      <button class="dialog-button dialog-button-secondary" @click="handleCancel">
        {{ cancelText }}
      </button>
      <button class="dialog-button dialog-button-primary" @click="handleConfirm">
        {{ confirmText }}
      </button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import BaseModal from './BaseModal.vue'

withDefaults(defineProps<{
  isOpen: boolean
  title?: string
  message?: string
  confirmText?: string
  cancelText?: string
  maxWidth?: string
}>(), {
  title: 'Confirm',
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  maxWidth: '450px'
})

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
.confirm-content {
  color: #ddd;
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

.dialog-button-primary:hover {
  background: #4d8dfa;
}
</style>
