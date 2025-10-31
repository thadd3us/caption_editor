import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './style.css'
import { useVTTStore } from './stores/vttStore'

console.log('VTT Editor starting...')

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.mount('#app')

// Always expose store on window for tests and debugging
const store = useVTTStore()
;(window as any).$store = store

if (import.meta.env && import.meta.env.DEV) {
  console.log('VTT Editor mounted - Store available at window.$store')
  console.log('Debug tip: console.log(JSON.stringify($store.document, null, 2))')
} else {
  console.log('VTT Editor mounted (production) - Store available at window.$store')
}

// Listen for file open events from OS (Electron only)
if (window.electronAPI?.onFileOpen) {
  window.electronAPI.onFileOpen(async (filePath: string) => {
    console.log('Opening file from OS:', filePath)

    // Read the file using Electron API
    const result = await window.electronAPI!.readFile(filePath)

    if (result.success && result.content) {
      // Load the VTT content into the store
      store.loadFromFile(result.content, result.filePath)
      console.log('File loaded successfully:', filePath)
    } else {
      console.error('Failed to load file:', result.error)
    }
  })
}
