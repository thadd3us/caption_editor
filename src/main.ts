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

// Expose store on window for debugging in development
if (import.meta.env.DEV) {
  const store = useVTTStore()
  ;(window as any).$store = store
  console.log('VTT Editor mounted - Store available at window.$store')
  console.log('Debug tip: console.log(JSON.stringify($store.document, null, 2))')
} else {
  console.log('VTT Editor mounted')
}
