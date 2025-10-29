import { defineConfig } from 'vite'
import { builtinModules } from 'module'

export default defineConfig({
  build: {
    lib: {
      entry: {
        main: 'electron/main.ts',
        preload: 'electron/preload.ts'
      },
      formats: ['es']
    },
    outDir: 'dist-electron',
    emptyOutDir: true,
    rollupOptions: {
      external: [
        'electron',
        ...builtinModules.flatMap(m => [m, `node:${m}`])
      ],
      output: {
        entryFileNames: '[name].js'
      }
    },
    target: 'node18',
    sourcemap: true
  }
})
