const { app, BrowserWindow } = require('electron')
const path = require('path')

function createWindow() {
  // Check HEADLESS env var - this is how we control window visibility
  const isHeadless = process.env.HEADLESS === 'true'

  console.log('[main] ========================================')
  console.log('[main] Starting Electron app')
  console.log('[main] HEADLESS env:', process.env.HEADLESS)
  console.log('[main] Running in headless mode:', isHeadless)
  console.log('[main] ========================================')

  const win = new BrowserWindow({
    width: 800,
    height: 600,
    show: !isHeadless,  // KEY: Only show window if NOT headless
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  win.loadFile('index.html')

  // Log window visibility after creation
  console.log('[main] Window created')
  console.log('[main] Window isVisible():', win.isVisible())
}

app.whenReady().then(() => {
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
