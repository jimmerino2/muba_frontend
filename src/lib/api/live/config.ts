import { http } from '../http'

/**
 * Platform defaults, read from the backend rather than guessed at.
 *
 * `GET /api/config` (public, no auth) returns the backend's own
 * `gonkaConfig.truthScoreThreshold` — the value a policy falls back to when
 * it sets no `coverageRules.minTrustScore` of its own (see `adapters.ts`
 * toPolicy). Fetched once and cached for the life of the tab; a request that
 * fails (backend briefly unreachable, say) falls back to
 * `VITE_TRUTH_SCORE_THRESHOLD`/80 rather than blocking the caller, since this
 * is only ever a fallback value to begin with.
 */
let cachedTruthScoreThreshold: number | null = null
let inFlight: Promise<number> | null = null

const ENV_FALLBACK = Number(
  (import.meta.env.VITE_TRUTH_SCORE_THRESHOLD as string | undefined) ?? 80,
)

export async function getPlatformTruthScoreThreshold(): Promise<number> {
  if (cachedTruthScoreThreshold !== null) return cachedTruthScoreThreshold
  if (!inFlight) {
    inFlight = http<{ truthScoreThreshold: number }>('/api/config', { auth: false })
      .then((data) => {
        cachedTruthScoreThreshold = data.truthScoreThreshold
        return cachedTruthScoreThreshold
      })
      .catch(() => {
        cachedTruthScoreThreshold = ENV_FALLBACK
        return cachedTruthScoreThreshold
      })
  }
  return inFlight
}

/** Mirrors the backend's `SETTLEMENT_MOCK_MYR_PER_USDC`. Display only — the
 * settled amount itself is never converted. */
export const MYR_PER_USDC = Number(
  (import.meta.env.VITE_MYR_PER_USDC as string | undefined) ?? 4.7,
)
