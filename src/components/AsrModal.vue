<template>
  <div v-if="isVisible" class="asr-modal-overlay" @click.self="handleOverlayClick">
    <div class="asr-modal">
      <div class="asr-modal-header">
        <h2>Speech Recognition</h2>
        <p class="asr-status">{{ statusText }}</p>
      </div>

      <div class="asr-terminal" ref="terminalRef">
        <pre v-html="formattedTerminalOutput"></pre>
      </div>

      <div class="asr-modal-footer">
        <button
          :class="['asr-button', failed ? 'asr-button-error' : 'asr-button-cancel']"
          @click="handleCancel"
        >
          {{ cancelButtonText }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import Ansi from 'ansi-to-html'

const convert = new Ansi({
  newline: true,
  escapeXML: true,
  stream: true
})

const props = defineProps<{
  isVisible: boolean
  isRunning: boolean
  failed: boolean
}>()

const emit = defineEmits<{
  cancel: []
}>()

const terminalOutput = ref('')
const terminalRef = ref<HTMLElement | null>(null)

const formattedTerminalOutput = computed(() => {
  return convert.toHtml(terminalOutput.value)
})

const statusText = computed(() => {
  if (props.failed) return 'Process failed'
  if (props.isRunning) return 'Running...'
  return 'Initializing...'
})

const cancelButtonText = computed(() => {
  if (props.failed) return 'Close Failed ASR Run'
  return 'Cancel'
})

// Auto-scroll terminal to bottom when output is added
watch(() => terminalOutput.value, async () => {
  await nextTick()
  if (terminalRef.value) {
    terminalRef.value.scrollTop = terminalRef.value.scrollHeight
  }
})

// Clear output when modal is hidden
watch(() => props.isVisible, (visible) => {
  if (!visible) {
    terminalOutput.value = ''
  }
})

function appendOutput(data: string) {
  terminalOutput.value += data
}

function handleCancel() {
  emit('cancel')
}

function handleOverlayClick() {
  // Prevent closing by clicking overlay during processing
  if (!props.isRunning && !props.failed) {
    emit('cancel')
  }
}

// Expose method to parent component
defineExpose({
  appendOutput
})
</script>

<style scoped>
.asr-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.asr-modal {
  background: #1e1e1e;
  border-radius: 8px;
  width: 90%;
  max-width: 900px;
  height: 80%;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.asr-modal-header {
  padding: 20px;
  border-bottom: 1px solid #333;
}

.asr-modal-header h2 {
  margin: 0 0 8px 0;
  color: #fff;
  font-size: 20px;
  font-weight: 600;
}

.asr-status {
  margin: 0;
  color: #888;
  font-size: 14px;
}

.asr-terminal {
  flex: 1;
  overflow-y: auto;
  background: #0e0e0e;
  padding: 16px;
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.4;
}

.asr-terminal pre {
  margin: 0;
  color: #d4d4d4;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.asr-modal-footer {
  padding: 16px 20px;
  border-top: 1px solid #333;
  display: flex;
  justify-content: flex-end;
}

.asr-button {
  padding: 10px 24px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.asr-button-cancel {
  background: #555;
  color: #fff;
}

.asr-button-cancel:hover {
  background: #666;
}

.asr-button-error {
  background: #d32f2f;
  color: #fff;
}

.asr-button-error:hover {
  background: #c62828;
}

/* Scrollbar styling for terminal */
.asr-terminal::-webkit-scrollbar {
  width: 10px;
}

.asr-terminal::-webkit-scrollbar-track {
  background: #0e0e0e;
}

.asr-terminal::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 5px;
}

.asr-terminal::-webkit-scrollbar-thumb:hover {
  background: #666;
}
</style>
