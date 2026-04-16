/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string
  readonly VITE_FIREBASE_AUTH_DOMAIN: string
  readonly VITE_FIREBASE_PROJECT_ID: string
  readonly VITE_FIREBASE_STORAGE_BUCKET: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string
  readonly VITE_FIREBASE_APP_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Build-time constants injected via Vite `define` (see vite.config.ts).
// Sprint 4 (Hana) — replaces hardcoded APP_VERSION='0.0.0' (Marcus QA M-7).
declare const __APP_VERSION__: string
declare const __BUILD_TIME__: string
