import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Нужно для Electron (загрузка через file://)
  base: './',
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
