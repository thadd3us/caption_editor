<template>
  <BaseModal 
    :is-open="isOpen" 
    title="License Agreement" 
    max-width="600px"
    :close-on-overlay-click="false"
    :close-on-esc="false"
    @close="handleExit"
  >
    <div class="license-content">
      <p class="license-intro">
        Please review and accept the license agreement to continue using Caption Editor.
      </p>
      <pre class="license-text">{{ licenseText }}</pre>
    </div>

    <template #footer>
      <button class="dialog-button dialog-button-secondary" @click="handleExit">
        Exit
      </button>
      <button class="dialog-button dialog-button-primary" @click="handleAgree">
        I Agree
      </button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import BaseModal from './BaseModal.vue'
import { LICENSE_TEXT } from '../utils/licenseText'

defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  agree: []
  exit: []
}>()

const licenseText = LICENSE_TEXT

function handleAgree() {
  emit('agree')
}

function handleExit() {
  emit('exit')
}
</script>

<style scoped>
.license-content {
  color: var(--text-1);
}

.license-intro {
  margin-bottom: 12px;
  font-size: 14px;
}

.license-text {
  background: var(--surface-2, #1a1a2e);
  border: 1px solid var(--border-1, #333);
  border-radius: 6px;
  padding: 12px;
  font-size: 12px;
  line-height: 1.5;
  max-height: 350px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: monospace;
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

.dialog-button-secondary {
  background: var(--surface-3, #333);
  color: var(--text-1, #fff);
}

.dialog-button-secondary:hover {
  background: var(--surface-4, #444);
}
</style>
