import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community'
import App from './App.vue'
import './style.css'
import { useCaptionStore } from './stores/captionStore'
import { usePreferencesStore } from './stores/preferencesStore'
import { installFloatingTooltip } from './utils/floatingTooltip'

function applyThemeMode(mode: 'light' | 'dark') {
  document.documentElement.dataset.theme = mode

  // AG Grid v33+ theme modes (works with built-in themes using colorSchemeVariable).
  // See: https://ag-grid.com/javascript-data-grid/theming-colors/#theme-modes
  document.documentElement.setAttribute('data-ag-theme-mode', mode)
}

function setupSystemThemeSync() {
  // Default to light if matchMedia is unavailable (e.g. some test DOMs).
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    applyThemeMode('light')
    return
  }

  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  applyThemeMode(mq.matches ? 'dark' : 'light')

  const onChange = (e: MediaQueryListEvent) => {
    applyThemeMode(e.matches ? 'dark' : 'light')
  }

  // Some environments still use the older addListener/removeListener API.
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', onChange)
  } else if (typeof (mq as any).addListener === 'function') {
    ;(mq as any).addListener(onChange)
  }
}

// Register AG Grid modules (required for v35+)
ModuleRegistry.registerModules([AllCommunityModule])

console.log('Caption Editor starting...')

// Sync UI theme with macOS/system theme before mounting.
setupSystemThemeSync()

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.mount('#app')

/* Body-level tooltips (see floatingTooltip.ts); must run after mount so document.body exists. */
installFloatingTooltip()

// Always expose stores on window for tests and debugging
const store = useCaptionStore()
  ; (window as any).$store = store
  ; (window as any).$preferencesStore = usePreferencesStore()

if (import.meta.env && import.meta.env.DEV) {
  console.log('Caption Editor mounted - Store available at window.$store')
  console.log('Debug tip: console.log(JSON.stringify($store.document, null, 2))')
} else {
  console.log('Caption Editor mounted (production) - Store available at window.$store')
}

// Listen for file open events from OS (Electron only)
if (window.electronAPI?.onFileOpen) {
  window.electronAPI.onFileOpen(async (filePath: string) => {
    console.log('Opening file from OS:', filePath)

    // Delegate to App's shared open path so that opening a file from the OS goes
    // through the same unsaved-changes check as the Open menu and drag & drop.
    // (It used to call processFilePaths() directly, silently discarding edits.)
    const openViaApp = (window as any).handleExternalFileOpen
    if (typeof openViaApp === 'function') {
      await openViaApp([filePath])
      return
    }

    // App has not mounted its handler yet — fall back to direct ingestion. At this
    // point there is no document open, so there is nothing to discard.
    try {
      const { failures } = await store.processFilePaths([filePath])
      if (failures > 0) {
        if ((window as any).showAlert) {
          ;(window as any).showAlert({
            title: 'Load Failed',
            message: 'Failed to load file. Check console for details.'
          })
        }
      }
    } catch (err) {
      console.error('Failed to process file:', err)
      if ((window as any).showAlert) {
        ;(window as any).showAlert({
          title: 'Load Failed',
          message: 'Failed to load file: ' + (err instanceof Error ? err.message : 'Unknown error')
        })
      }
    }
  })
}
