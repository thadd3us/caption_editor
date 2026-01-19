const { app, BrowserWindow } = require('electron')
const path = require('path')

function createWindow() {
  // HEADLESS env var controls BrowserWindow's `show` option
  // Note: In Electron, there's no "headless mode" - windows are either visible (show: true)
  // or hidden (show: false). The process runs normally either way.
  const hideWindow = process.env.HEADLESS === 'true'

  console.log('[main] ========================================')
  console.log('[main] Starting Electron app')
  console.log('[main] HEADLESS env (controls show option):', process.env.HEADLESS)
  console.log('[main] Window will be hidden (show=false):', hideWindow)
  console.log('[main] ========================================')

  const win = new BrowserWindow({
    width: 800,
    height: 600,
    show: !hideWindow,  // KEY: BrowserWindow show option controls visibility
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  win.loadFile('index.html')

  // Log window visibility after creation
  console.log('[main] Window created with show=' + !hideWindow)
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
