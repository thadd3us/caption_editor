const { contextBridge, ipcRenderer, webUtils } = require('electron');

console.log('[preload] Preload script loaded')
console.log('[preload] webUtils available:', !!webUtils)
console.log('[preload] webUtils.getPathForFile available:', !!webUtils?.getPathForFile)
console.log('[preload] Exposing fileDrop API to renderer...')

contextBridge.exposeInMainWorld('fileDrop', {
  // New API: Get path from File object using webUtils
  getPathForFile: (file) => {
    console.log('[preload] getPathForFile called')
    console.log('[preload]   - file:', file)
    console.log('[preload]   - file.name:', file.name)

    try {
      const path = webUtils.getPathForFile(file)
      console.log('[preload]   ✓ Got path:', path)
      return path
    } catch (err) {
      console.error('[preload]   ✗ Error getting path:', err.message)
      return null
    }
  },

  sendPaths: (paths) => {
    console.log('[preload] sendPaths called with:', paths)
    ipcRenderer.send('dropped-files', paths)
    console.log('[preload] Sent dropped-files IPC message')
  },

  onProcessed: (callback) => {
    console.log('[preload] Registering onProcessed callback')
    ipcRenderer.on('file-processed', (event, result) => {
      console.log('[preload] Received file-processed:', result)
      callback(result)
    })
  }
});

console.log('[preload] fileDrop API exposed successfully')
