/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Dev proxy: forward the versioned API prefix to :8000 so the browser sees one
  // origin (SPEC.md → "Vite dev proxy"). All resource routes live under /api/v1
  // (ROADMAP R5); /health is unversioned but the frontend never calls it.
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
})
