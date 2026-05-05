import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import viteCompression from 'vite-plugin-compression'

export default defineConfig({
  plugins: [
    react(),
    viteCompression({
      algorithm: 'gzip',
      ext: '.gz',
    })
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: false,
      },
      '/media': {
        target: 'http://backend:8000',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts', 'chart.js', 'react-chartjs-2'],
          utils: ['date-fns', 'axios', 'lucide-react'],
          calendar: ['react-big-calendar', 'react-dnd', 'react-dnd-html5-backend']
        }
      }
    },
    chunkSizeWarningLimit: 1000
  },
})
