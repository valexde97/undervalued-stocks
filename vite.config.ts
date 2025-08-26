// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/',
  plugins: [react()],
  resolve: {
    alias: { '@': '/src' }
  }
  // порт не задаём — vercel сам пробросит $PORT
})
