// Setup file for vitest - polyfills for happy-dom
import { vi } from 'vitest'

// happy-dom doesn't provide window.alert
window.alert = vi.fn()
