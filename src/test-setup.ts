// Setup file for vitest - polyfills for happy-dom
import { vi } from 'vitest'

// happy-dom doesn't provide window.alert
window.alert = vi.fn()

// --- Web Storage, vs. Node 26 -----------------------------------------------
//
// Node 26 ships Web Storage as a *global*, and under happy-dom `globalThis`
// IS `window`, so Node's `localStorage` / `sessionStorage` accessors sit on the
// very object happy-dom wants to install its own onto. Node's win, and both
// halves of that are bad:
//
//   * `localStorage` — without `--localstorage-file` Node's getter returns
//     `undefined`, and because it shadows happy-dom's, `window.localStorage` is
//     undefined too. A spec doing `localStorage.getItem(...)` throws
//     "Cannot read properties of undefined".
//   * `sessionStorage` — Node returns a real, *process-wide* Storage. That does
//     not throw; specs just quietly read and write one store shared across the
//     whole run, so state leaks between tests instead of being reset with the
//     environment. Strictly worse than a visible failure.
//
// Replace both with fresh happy-dom Storage instances, as own value properties
// (not accessors — an accessor delegating to `window[key]` would recurse
// forever, given `globalThis === window` here). They stay `writable`, because
// several specs install their own `globalThis.localStorage = mock`, which is what
// happy-dom's own definition allowed.
//
// Production code reaches storage through `window.localStorage` and does not
// care either way; this exists so specs can use the bare global the way they
// would in a browser. `node --no-experimental-webstorage` fixes it too, but
// only for whoever remembers to pass it — doing it here covers every way
// vitest gets started.
const StorageCtor = (globalThis as unknown as { Storage: new () => Storage }).Storage
for (const key of ['localStorage', 'sessionStorage'] as const) {
  Object.defineProperty(globalThis, key, {
    value: new StorageCtor(),
    writable: true,
    configurable: true,
    enumerable: true,
  })
}
