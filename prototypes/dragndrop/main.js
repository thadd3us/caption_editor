const { app, BrowserWindow } = require('electron')
const path = require('path')

console.log('='.repeat(50))
console.log('Drag-and-Drop Test App Starting')
console.log('Electron version:', process.versions.electron)
console.log('Chrome version:', process.versions.chrome)
console.log('Node version:', process.versions.node)
console.log('='.repeat(50))

let mainWindow

function createWindow() {
  console.log('[main] Creating window...')

  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false
    }
  })

  console.log('[main] Window created with settings:')
  console.log('[main]   - contextIsolation: true')
  console.log('[main]   - nodeIntegration: false')
  console.log('[main]   - sandbox: false')
  console.log('[main]   - webSecurity: false')

  mainWindow.loadFile('index.html')
  mainWindow.webContents.openDevTools()

  console.log('[main] Loaded index.html and opened DevTools')
}

app.whenReady().then(() => {
  console.log('[main] App ready, creating window...')
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
