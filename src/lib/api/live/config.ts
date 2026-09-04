/**
 * Platform constants the backend applies but does not currently expose over
 * HTTP.
 *
 * The UI's `Policy` models a per-policy `truthScoreThreshold`; the backend
 * applies one platform-wide value (`TRUTH_SCORE_THRESHOLD`, default 80) and
 * lets a policy override only the *amount* gate. Rather than invent a
 * per-policy score threshold in the adapter, the platform value is stated here
 * once, and overridable per environment so a deployment that changes the
 * backend's threshold can keep the two in step.
 *
 * This is a known duplication, not a hidden one. The clean fix is a
 * `GET /api/config` on the backend returning its own thresholds; until that
 * exists, one constant in one file beats the same number scattered through the
 * views.
 */
export const TRUTH_SCORE_THRESHOLD = Number(
  (import.meta.env.VITE_TRUTH_SCORE_THRESHOLD as string | undefined) ?? 80,
)

/** Mirrors the backend's `SETTLEMENT_MOCK_MYR_PER_USDC`. Display only — the
 * settled amount itself is never converted. */
export const MYR_PER_USDC = Number(
  (import.meta.env.VITE_MYR_PER_USDC as string | undefined) ?? 4.7,
)
