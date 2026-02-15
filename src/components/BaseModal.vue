<template>
  <Transition name="fade">
    <div v-if="isOpen" class="base-modal-overlay" @click.self="handleOverlayClick">
      <Transition name="scale">
        <div v-if="isOpen" class="base-modal" :style="{ maxWidth: maxWidth }" role="dialog" aria-modal="true">
          <div v-if="$slots.header || title" class="base-modal-header">
            <slot name="header">
              <h2>{{ title }}</h2>
            </slot>
          </div>

          <div class="base-modal-content">
            <slot></slot>
          </div>

          <div v-if="$slots.footer" class="base-modal-footer">
            <slot name="footer"></slot>
          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

const props = withDefaults(defineProps<{
  isOpen: boolean
  title?: string
  maxWidth?: string
  closeOnOverlayClick?: boolean
  closeOnEsc?: boolean
}>(), {
  maxWidth: '500px',
  closeOnOverlayClick: true,
  closeOnEsc: true
})

const emit = defineEmits<{
  close: []
}>()

function handleOverlayClick() {
  if (props.closeOnOverlayClick) {
    emit('close')
  }
}

function handleEscKey(e: KeyboardEvent) {
  if (props.isOpen && props.closeOnEsc && e.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleEscKey)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleEscKey)
})
</script>

<style scoped>
.base-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--overlay-bg);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.base-modal {
  background: var(--surface-popover);
  border-radius: 12px;
  width: 90%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  border: 1px solid var(--border-1);
  overflow: hidden;
}

.base-modal-header {
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-1);
}

.base-modal-header h2 {
  margin: 0;
  color: var(--text-1);
  font-size: 18px;
  font-weight: 600;
}

.base-modal-content {
  padding: 24px;
  color: var(--text-1);
  line-height: 1.5;
  overflow-y: auto;
}

.base-modal-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--border-1);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  background: var(--surface-1);
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.scale-enter-active,
.scale-leave-active {
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.scale-enter-from,
.scale-leave-to {
  transform: scale(0.95);
}
</style>
