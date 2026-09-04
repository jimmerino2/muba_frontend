/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

/**
 * The build-time configuration this app reads. Declared so a typo in an
 * `import.meta.env` key is a type error rather than a silent `undefined` that
 * only shows up as a broken request at runtime.
 *
 * Values live in `.env.local` (gitignored) — see `.env.example` for what each
 * one is for. Nothing secret belongs here: everything under `VITE_` is compiled
 * into the bundle and visible to anyone who opens the page. The Google OAuth
 * *client id* is public by design; the client secret, the zkLogin salt secret
 * and the Gonka key stay on the backend.
 */
interface ImportMetaEnv {
  /** Where the backend lives. Default: http://localhost:4000 */
  readonly VITE_API_BASE_URL?: string
  /** 'mock' resolves from the in-memory fixtures; anything else is live. */
  readonly VITE_API_MODE?: 'live' | 'mock'
  /** Google OAuth client id — must be the same one the backend verifies
   * against (its GOOGLE_CLIENT_ID). Without it, zkLogin is unavailable and the
   * login screen says so. */
  readonly VITE_GOOGLE_CLIENT_ID?: string
  /** Mirrors the backend's TRUTH_SCORE_THRESHOLD. Default: 80 */
  readonly VITE_TRUTH_SCORE_THRESHOLD?: string
  /** Mirrors the backend's SETTLEMENT_MOCK_MYR_PER_USDC. Default: 4.7 */
  readonly VITE_MYR_PER_USDC?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
