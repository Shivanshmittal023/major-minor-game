import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    host: true, // reachable from phones on the same Wi-Fi during development
    proxy: { '/api': 'http://localhost:8787' },
  },
})
