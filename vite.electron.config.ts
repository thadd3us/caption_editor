import { defineConfig } from 'vite'
import { builtinModules } from 'module'

/**
 * Electron main process.
 *
 * The preload is built separately (`vite.preload.config.ts`) rather than as a second
 * entry here. With two entries Rollup hoists anything they share — `electron/constants.ts`
 * — into a chunk, and the preload then starts with `require("./constants-<hash>.cjs")`.
 * That is fatal under `sandbox: true`: a sandboxed preload's `require` resolves only
 * `electron`, `events`, `timers` and `url`, so the call throws, `exposeInMainWorld` never
 * runs, and `window.electronAPI` is undefined with no obvious error anywhere.
 *
 * Keeping the builds separate makes each output self-contained by construction.
 */
export default defineConfig({
  build: {
    lib: {
      entry: { main: 'electron/main.ts' },
      formats: ['cjs']
    },
    outDir: 'dist-electron',
    // The preload build runs after this one and must not wipe it.
    emptyOutDir: true,
    rollupOptions: {
      external: [
        'electron',
        ...builtinModules.flatMap(m => [m, `node:${m}`])
      ],
      output: {
        entryFileNames: '[name].cjs'
      }
    },
    target: 'node18',
    sourcemap: true
  }
})
