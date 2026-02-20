<template>
  <BaseModal
    :is-open="isVisible"
    title="Fix MP3 for Accurate Playback?"
    max-width="540px"
    @close="handleSkip"
  >
    <div class="dialog-content">
      <p>
        The media file is an MP3 without a seek table. This can cause
        <strong>playback timestamps to drift</strong> progressively in longer files,
        making captions appear out of sync.
      </p>
      <p>
        A seekable copy of the MP3 can be created (lossless, no re-encoding)
        that the caption editor will use for accurate playback.
      </p>
    </div>

    <template #footer>
      <button class="dialog-button dialog-button-secondary" @click="handleSkip">
        Skip
      </button>
      <button class="dialog-button dialog-button-primary" @click="handleRemux">
        Create Seekable Copy
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
  remux: []
  skip: []
}>()

function handleRemux() {
  emit('remux')
}

function handleSkip() {
  emit('skip')
}
</script>

<style scoped>
.dialog-content {
  color: var(--text-1);
}

.dialog-content p {
  margin-bottom: 12px;
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

.dialog-button-primary {
  background: #1976d2;
  color: #fff;
}

.dialog-button-primary:hover {
  background: #1565c0;
}
</style>
