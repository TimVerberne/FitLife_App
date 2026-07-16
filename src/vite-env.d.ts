/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_VAPID_PUBLIC_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Injected by vite.config.ts's `define` from package.json's version field —
// bump that on every deploy so this stays a reliable "what am I looking at".
declare const __APP_VERSION__: string;
