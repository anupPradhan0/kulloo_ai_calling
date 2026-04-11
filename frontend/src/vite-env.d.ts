/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  /** Same-origin API + WebSocket (Docker nginx proxy). */
  readonly VITE_USE_RELATIVE_API?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
