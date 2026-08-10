import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** В Docker UI живёт под /admin/; локальный vite — в корне :5174. */
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/admin/' : '/',
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
}))
