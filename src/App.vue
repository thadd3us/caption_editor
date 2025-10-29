<template>
  <div class="app">
    <MenuBar @open-files="handleOpenFiles" @files-dropped="handleFilesDropped" />
    <div class="main-content">
      <div class="resizable-container">
        <div class="left-panel" :style="{ width: leftPanelWidth + '%' }">
          <CaptionTable />
        </div>
        <div class="resizer" @mousedown="startResize"></div>
        <div class="right-panel" :style="{ width: (100 - leftPanelWidth) + '%' }">
          <MediaPlayer />
        </div>
      </div>
    </div>
    <FileDropZone ref="fileDropZone" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import MenuBar from './components/MenuBar.vue'
import CaptionTable from './components/CaptionTable.vue'
import MediaPlayer from './components/MediaPlayer.vue'
import FileDropZone from './components/FileDropZone.vue'

const leftPanelWidth = ref(60)
const fileDropZone = ref<InstanceType<typeof FileDropZone> | null>(null)
let isResizing = false

function handleOpenFiles() {
  fileDropZone.value?.triggerFileInput()
}

function handleFilesDropped(files: File[]) {
  fileDropZone.value?.processFiles(files)
}

function startResize(e: MouseEvent) {
  console.log('Starting panel resize')
  isResizing = true
  e.preventDefault()

  const onMouseMove = (e: MouseEvent) => {
    if (!isResizing) return

    const containerWidth = (e.currentTarget as HTMLElement)?.parentElement?.offsetWidth
    if (!containerWidth) return

    const newWidth = (e.clientX / containerWidth) * 100
    if (newWidth >= 20 && newWidth <= 80) {
      leftPanelWidth.value = newWidth
    }
  }

  const onMouseUp = () => {
    console.log('Ending panel resize')
    isResizing = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}
</script>

<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body, #app {
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.main-content {
  flex: 1;
  overflow: hidden;
}

.resizable-container {
  display: flex;
  height: 100%;
}

.left-panel {
  height: 100%;
  overflow: auto;
  background: #f5f5f5;
}

.resizer {
  width: 4px;
  background: #ddd;
  cursor: col-resize;
  flex-shrink: 0;
}

.resizer:hover {
  background: #999;
}

.right-panel {
  height: 100%;
  overflow: auto;
  background: #fff;
}
</style>
