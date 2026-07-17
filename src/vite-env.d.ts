/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin for a cross-origin deploy; empty/undefined = same origin via the dev proxy. */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
