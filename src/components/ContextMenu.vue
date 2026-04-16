<template>
  <div
    v-if="isVisible"
    class="context-menu-overlay"
    @click="handleOverlayClick"
    @contextmenu.prevent
  >
    <div
      class="context-menu"
      :style="{ top: position.y + 'px', left: position.x + 'px' }"
      @click.stop
    >
      <div v-if="headerText" class="context-menu-header" aria-hidden="true">
        {{ headerText }}
      </div>
      <div
        v-for="(item, index) in items"
        :key="index"
        class="context-menu-item"
        :class="{ disabled: item.disabled }"
        @click="handleItemClick(item)"
      >
        {{ item.label }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ContextMenuItem } from './ContextMenu.types'

defineProps<{
  isVisible: boolean
  position: { x: number; y: number }
  items: ContextMenuItem[]
  /** Optional non-interactive title (e.g. how many rows an action affects). */
  headerText?: string
}>()

const emit = defineEmits<{
  close: []
}>()

function handleOverlayClick() {
  emit('close')
}

function handleItemClick(item: ContextMenuItem) {
  if (item.disabled) return

  item.action()
  emit('close')
}
</script>

<style scoped>
.context-menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1500;
  background: transparent;
}

.context-menu {
  position: fixed;
  background: var(--surface-popover);
  border: 1px solid var(--border-1);
  border-radius: 4px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  min-width: 180px;
  padding: 4px 0;
  z-index: 1501;
}

.context-menu-header {
  padding: 6px 12px 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--text-3, #888);
  border-bottom: 1px solid var(--border-1);
  margin-bottom: 2px;
  pointer-events: none;
  user-select: none;
}

.context-menu-item {
  padding: 8px 16px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-1);
  user-select: none;
}

.context-menu-item:hover:not(.disabled) {
  background: var(--surface-hover);
}

.context-menu-item.disabled {
  color: var(--text-3);
  cursor: not-allowed;
}
</style>
