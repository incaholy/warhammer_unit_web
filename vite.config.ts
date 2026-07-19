/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Dev proxy: forward the backend's route prefixes to :8000 so the browser
  // sees one origin (SPEC.md → "Vite dev proxy").
  server: {
    proxy: Object.fromEntries(
      ['/auth', '/me', '/users', '/units', '/factions', '/weapons', '/abilities', '/health'].map((p) => [
        p,
        { target: 'http://localhost:8000', changeOrigin: true },
      ]),
    ),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
})
