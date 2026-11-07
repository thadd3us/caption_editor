import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import istanbul from 'vite-plugin-istanbul'

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    istanbul({
      include: 'src/*',
      exclude: ['node_modules', 'tests/'],
      extension: ['.js', '.ts', '.vue'],
      requireEnv: false,
    })
  ],
  server: {
    port: 3000
  },
  resolve: {
    // Required by the Bazel `//:ts_vitest_unit` target, and harmless elsewhere.
    //
    // Under Bazel every input is a symlink in the runfiles tree pointing out to
    // `bazel-out/.../bin/`, which is NOT mounted inside the sandbox. Vitest 5
    // resolves `setupFiles` to its real path, so `./src/test-setup.ts` became an
    // absolute path that does not exist in the sandbox and all 28 suites failed
    // to load with `Cannot find module '/@fs/.../bin/src/test-setup.ts'`.
    // Vitest 4 kept the runfiles path and so never tripped on this.
    //
    // Keeping symlinks unresolved is also what aspect_rules_js wants generally:
    // its node_modules tree is symlinks all the way down.
    preserveSymlinks: true
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.ts'],
    exclude: ['tests/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.test.ts', 'src/main.ts', 'src/types/**']
    }
  }
})
