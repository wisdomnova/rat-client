import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'https://rat-backend-production.up.railway.app',
        changeOrigin: true,
      },
      '/ws': {
        target: 'wss://rat-backend-production.up.railway.app',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
