import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './style.css'

console.log('VTT Editor starting...')

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.mount('#app')

console.log('VTT Editor mounted')
