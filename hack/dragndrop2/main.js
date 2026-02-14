const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

console.log('='.repeat(60))
console.log('Drag-and-Drop Test v2 - Testing f.path in renderer')
console.log('Electron version:', process.versions.electron)
console.log('='.repeat(60))

function createWindow() {
  console.log('[main] Creating window...')

  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      contextIsolation: true, // important
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  console.log('[main] Loading renderer.html...')
  win.loadFile('renderer.html');
  win.webContents.openDevTools()

  console.log('[main] Window created successfully')
}

// Receive file paths from renderer
ipcMain.on('dropped-files', (event, filePaths) => {
  console.log('[main] ========================================')
  console.log('[main] Received dropped-files IPC message!')
  console.log('[main] Number of paths:', filePaths.length)
  console.log('[main] Paths:', filePaths)
  console.log('[main] ========================================')

  // Example: read and re-save the first file
  const first = filePaths[0];
  if (first && first !== 'undefined') {
    try {
      console.log('[main] Attempting to read file:', first)
      const content = fs.readFileSync(first, 'utf8');
      console.log('[main] ✓ Successfully read file, size:', content.length, 'bytes')

      const copyPath = first + '.copy'
      fs.writeFileSync(copyPath, content, 'utf8');
      console.log('[main] ✓ Copied', first, '->', copyPath)

      // Send success back to renderer
      event.reply('file-processed', { success: true, path: first, copyPath })
    } catch (err) {
      console.error('[main] ✗ Error processing file:', err.message)
      event.reply('file-processed', { success: false, error: err.message, path: first })
    }
  } else {
    console.log('[main] ✗ No valid file path received (got:', first, ')')
    event.reply('file-processed', { success: false, error: 'No valid file path' })
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
