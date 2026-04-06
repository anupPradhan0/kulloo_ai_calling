import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const PORT = 4050

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: PORT,
    strictPort: true,
    host: true,
  },
  preview: {
    port: PORT,
    strictPort: true,
    host: true,
  },
})
