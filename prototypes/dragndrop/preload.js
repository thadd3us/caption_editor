const { contextBridge } = require('electron')

console.log('[preload] Preload script loaded')
console.log('[preload] contextBridge available:', !!contextBridge)

// Expose a simple API to the renderer
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: process.versions
})

console.log('[preload] Exposed electronAPI to renderer')

// Set up drag-and-drop handlers
window.addEventListener('DOMContentLoaded', () => {
  console.log('[preload] DOMContentLoaded - Setting up drag-and-drop handlers')

  document.addEventListener('dragover', (e) => {
    e.preventDefault()
    e.stopPropagation()
    console.log('[preload] dragover event')
  })

  document.addEventListener('drop', (e) => {
    e.preventDefault()
    e.stopPropagation()

    console.log('[preload] ========== DROP EVENT ==========')
    console.log('[preload] Event type:', e.type)
    console.log('[preload] dataTransfer:', e.dataTransfer)
    console.log('[preload] dataTransfer.files:', e.dataTransfer?.files)
    console.log('[preload] dataTransfer.files.length:', e.dataTransfer?.files?.length)

    const files = e.dataTransfer?.files
    if (!files || files.length === 0) {
      console.log('[preload] ERROR: No files in drop event')
      return
    }

    console.log('[preload] Processing', files.length, 'files:')

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      console.log(`[preload] File ${i}:`)
      console.log(`[preload]   - name:`, file.name)
      console.log(`[preload]   - type:`, file.type)
      console.log(`[preload]   - size:`, file.size)
      console.log(`[preload]   - lastModified:`, file.lastModified)
      console.log(`[preload]   - path:`, file.path)
      console.log(`[preload]   - File object keys:`, Object.keys(file))
      console.log(`[preload]   - File object (all properties):`, file)

      // Try to access path in different ways
      console.log(`[preload]   - file['path']:`, file['path'])
      console.log(`[preload]   - file.path:`, file.path)
      console.log(`[preload]   - Checking for path in prototype chain...`)

      let obj = file
      let depth = 0
      while (obj && depth < 5) {
        const keys = Object.getOwnPropertyNames(obj)
        if (keys.includes('path')) {
          console.log(`[preload]     Found 'path' at depth ${depth}:`, obj.path)
        }
        obj = Object.getPrototypeOf(obj)
        depth++
      }

      // Display in the UI
      const result = document.getElementById('result')
      if (result) {
        const fileDiv = document.createElement('div')
        fileDiv.style.border = '1px solid #ccc'
        fileDiv.style.padding = '10px'
        fileDiv.style.margin = '10px 0'
        fileDiv.innerHTML = `
          <strong>File ${i + 1}:</strong><br>
          Name: ${file.name}<br>
          Type: ${file.type}<br>
          Size: ${file.size} bytes<br>
          Path: ${file.path || 'UNDEFINED'}<br>
          <em>Path status: ${file.path ? '✓ Available' : '✗ Not available'}</em>
        `
        result.appendChild(fileDiv)
      }
    }

    console.log('[preload] ========== END DROP EVENT ==========')
  })

  console.log('[preload] Drop handlers registered')
})
