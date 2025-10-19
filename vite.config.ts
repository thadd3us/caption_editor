import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import istanbul from 'vite-plugin-istanbul'

export default defineConfig({
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
  }
})
