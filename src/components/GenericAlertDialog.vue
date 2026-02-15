<template>
  <BaseModal 
    :is-open="isOpen" 
    :title="title" 
    :max-width="maxWidth" 
    @close="handleClose"
  >
    <div class="alert-content">
      <p v-if="message">{{ message }}</p>
      <slot></slot>
    </div>

    <template #footer>
      <button class="dialog-button dialog-button-primary" @click="handleClose">
        {{ buttonText }}
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
  buttonText?: string
  maxWidth?: string
}>(), {
  title: 'Notice',
  buttonText: 'OK',
  maxWidth: '400px'
})

const emit = defineEmits<{
  close: []
}>()

function handleClose() {
  emit('close')
}
</script>

<style scoped>
.alert-content {
  color: var(--text-1);
}

.dialog-button {
  padding: 10px 24px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.dialog-button-primary {
  background: #3a7afe;
  color: #fff;
}

.dialog-button-primary:hover {
  background: #4d8dfa;
}
</style>
