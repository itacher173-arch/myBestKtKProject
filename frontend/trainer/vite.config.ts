import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** В Docker UI живёт под /app/; локальный vite — в корне :5173. */
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/app/' : '/',
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:8106',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  preview: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:8106',
        ws: true,
        changeOrigin: true,
      },
    },
  },
}))
