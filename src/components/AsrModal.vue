<template>
  <div v-if="isVisible" class="asr-modal-overlay" @click.self="handleOverlayClick">
    <div class="asr-modal">
      <div class="asr-modal-header">
        <h2>{{ title || 'Speech Recognition' }}</h2>
        <p class="asr-status">{{ statusText }}</p>
      </div>

      <div class="asr-terminal" ref="terminalRef">
        <pre ref="preRef"></pre>
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
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import Ansi from 'ansi-to-html'

const MAX_SCROLLBACK_CHARS = 200_000 // ~200KB of raw text before trimming

const props = defineProps<{
  isVisible: boolean
  isRunning: boolean
  failed: boolean
  title?: string
}>()

const emit = defineEmits<{
  cancel: []
}>()

const terminalRef = ref<HTMLElement | null>(null)
const preRef = ref<HTMLElement | null>(null)

// --- Batched, incremental output rendering ---
// We accumulate raw chunks in a buffer and flush them to the DOM
// at most once per animation frame. ANSI conversion is only done
// on new chunks (stream mode), and we append HTML rather than
// replacing the entire innerHTML.

let convert = new Ansi({ newline: false, escapeXML: true, stream: true })
let pendingChunks: string[] = []
let rafId: number | null = null
let totalRawLength = 0

function scheduleFlush() {
  if (rafId !== null) return
  rafId = requestAnimationFrame(flushOutput)
}

function flushOutput() {
  rafId = null
  if (pendingChunks.length === 0) return

  const raw = pendingChunks.join('')
  pendingChunks = []
  totalRawLength += raw.length

  const html = convert.toHtml(raw)

  const pre = preRef.value
  if (!pre) return

  // Append the new HTML fragment (no full re-render)
  pre.insertAdjacentHTML('beforeend', html)

  // Trim scrollback if it's grown too large: remove early child nodes
  if (totalRawLength > MAX_SCROLLBACK_CHARS) {
    trimScrollback(pre)
  }

  // Auto-scroll
  const terminal = terminalRef.value
  if (terminal) {
    terminal.scrollTop = terminal.scrollHeight
  }
}

function trimScrollback(pre: HTMLElement) {
  // Remove roughly the first half of content by removing child nodes
  // until we've removed ~half the text. This is cheap because we're
  // removing from the start of the DOM (no reflow of later nodes).
  const target = pre.innerHTML.length / 2
  let removed = 0
  while (pre.firstChild && removed < target) {
    const len = (pre.firstChild as Element).outerHTML?.length
      ?? pre.firstChild.textContent?.length ?? 0
    pre.removeChild(pre.firstChild)
    removed += len
  }
  totalRawLength = pre.textContent?.length ?? 0
}

function appendOutput(data: string) {
  pendingChunks.push(data)
  scheduleFlush()
}

function clearOutput() {
  pendingChunks = []
  totalRawLength = 0
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  convert = new Ansi({ newline: false, escapeXML: true, stream: true })
  if (preRef.value) {
    preRef.value.innerHTML = ''
  }
}

const statusText = computed(() => {
  if (props.failed) return 'Process failed'
  if (props.isRunning) return 'Running...'
  return 'Initializing...'
})

const cancelButtonText = computed(() => {
  if (props.failed) return 'Close Failed ASR Run'
  return 'Cancel'
})

// Clear output when modal is hidden
watch(() => props.isVisible, (visible) => {
  if (!visible) {
    clearOutput()
  }
})

onBeforeUnmount(() => {
  if (rafId !== null) cancelAnimationFrame(rafId)
})

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
  background: var(--overlay-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.asr-modal {
  background: var(--surface-popover);
  border-radius: 8px;
  width: 90%;
  max-width: 900px;
  height: 80%;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  border: 1px solid var(--border-1);
}

.asr-modal-header {
  padding: 20px;
  border-bottom: 1px solid var(--border-1);
}

.asr-modal-header h2 {
  margin: 0 0 8px 0;
  color: var(--text-1);
  font-size: 20px;
  font-weight: 600;
}

.asr-status {
  margin: 0;
  color: var(--text-3);
  font-size: 14px;
}

.asr-terminal {
  flex: 1;
  overflow-y: auto;
  background: var(--terminal-bg);
  padding: 16px;
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.4;
}

.asr-terminal pre {
  margin: 0;
  color: var(--terminal-text);
  white-space: pre-wrap;
  word-wrap: break-word;
}

.asr-modal-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--border-1);
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
  background: var(--btn-secondary-bg);
  color: var(--btn-secondary-text);
}

.asr-button-cancel:hover {
  background: var(--btn-secondary-hover-bg);
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
  background: var(--terminal-bg);
}

.asr-terminal::-webkit-scrollbar-thumb {
  background: var(--btn-secondary-bg);
  border-radius: 5px;
}

.asr-terminal::-webkit-scrollbar-thumb:hover {
  background: var(--btn-secondary-hover-bg);
}
</style>
