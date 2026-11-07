import { defineConfig } from 'vite'
import { builtinModules } from 'module'

/**
 * Electron preload — built on its own so the output is a single self-contained file.
 *
 * See the note in `vite.electron.config.ts`: building it alongside the main process
 * produced a shared chunk that a sandboxed preload cannot `require`, which silently
 * removed `window.electronAPI` in its entirety.
 *
 * Node builtins stay external and must simply not be imported here. A sandboxed preload
 * has no `path`, `fs` or `child_process`; anything the renderer needs from them goes
 * through IPC to the main process instead (see the `path:call` handler).
 */
export default defineConfig({
  build: {
    lib: {
      entry: { preload: 'electron/preload.ts' },
      formats: ['cjs']
    },
    outDir: 'dist-electron',
    // Must not clear the directory: the main-process build already wrote into it.
    emptyOutDir: false,
    rollupOptions: {
      external: [
        'electron',
        ...builtinModules.flatMap(m => [m, `node:${m}`])
      ],
      output: {
        entryFileNames: '[name].cjs',
        // Belt and braces: one entry means nothing to split, but if a future import
        // reintroduces a shared module this keeps it inlined rather than silently
        // breaking the sandbox again. (Was `inlineDynamicImports: true`, which
        // Rolldown -- Vite 8's bundler -- deprecated in favour of this spelling.)
        codeSplitting: false
      }
    },
    target: 'node18',
    sourcemap: true
  }
})
