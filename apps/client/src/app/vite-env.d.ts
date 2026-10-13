/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Colyseus server endpoint, e.g. ws://localhost:2567 */
  readonly VITE_SERVER_URL?: string;
  /** Rustrak DSN (public ingest key); reporting is off when unset. */
  readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
