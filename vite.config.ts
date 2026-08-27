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
    // A floor, not a target (ROADMAP F8). Thresholds sit just under today's
    // numbers so a new module shipping untested fails the build, while nobody is
    // asked to write tests to reach an aspirational figure. Raise them when the
    // real numbers rise; that is the only way a floor stays meaningful.
    //
    // Coverage measures lines executed, not behaviour verified -- a test that
    // runs code and asserts nothing counts as covered. Treat it as a smoke alarm.
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      // Test scaffolding is not application code.
      exclude: ['src/test/**', 'src/**/*.test.*', 'src/main.tsx', 'src/vite-env.d.ts', 'scripts/**'],
      thresholds: {
        statements: 88,
        branches: 82,
        functions: 87,
        lines: 90,
      },
    },
  },
})
