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
export interface ContextMenuItem {
  label: string
  action: () => void
  disabled?: boolean
}

defineProps<{
  isVisible: boolean
  position: { x: number; y: number }
  items: ContextMenuItem[]
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
  background: white;
  border: 1px solid #ccc;
  border-radius: 4px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  min-width: 180px;
  padding: 4px 0;
  z-index: 1501;
}

.context-menu-item {
  padding: 8px 16px;
  cursor: pointer;
  font-size: 14px;
  color: #333;
  user-select: none;
}

.context-menu-item:hover:not(.disabled) {
  background: #f0f0f0;
}

.context-menu-item.disabled {
  color: #999;
  cursor: not-allowed;
}
</style>
