import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3421,
    proxy: {
      '/api': {
        target: 'http://localhost:3420',
        changeOrigin: true
      }
    }
  }
})
