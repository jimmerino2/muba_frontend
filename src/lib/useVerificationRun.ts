import { onUnmounted, ref } from 'vue'
import * as verificationApi from '@/lib/api/verification'
import type { VerifyOutcome } from '@/lib/api/verification'
import { ApiError } from '@/lib/api/client'

/** After a client-side timeout, the request that would have carried the
 * result is gone, but the backend keeps working regardless (see
 * live/verification.ts recoverVerifyOutcome's own note). Poll a few times
 * rather than once — verification plus, for an auto-approved claim, up to 3
 * settlement retries can still be finishing up right as the client gives up. */
const RECOVERY_POLL_ATTEMPTS = 6
const RECOVERY_POLL_DELAY_MS = 5_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function pollForRecovery(claimId: string): Promise<VerifyOutcome | null> {
  for (let attempt = 0; attempt < RECOVERY_POLL_ATTEMPTS; attempt += 1) {
    await sleep(RECOVERY_POLL_DELAY_MS)
    const recovered = await verificationApi.recoverVerifyOutcome(claimId).catch(() => null)
    if (recovered) return recovered
  }
  return null
}

/**
 * Drives a Gonka verification run and the visible progress beside it.
 *
 * The steps advance on a timer while the (deliberately slow) router call is in
 * flight — the point is that the user sees what the system is doing, not a
 * featureless spinner, and that the on-chain attestation is visibly part of it.
 */
export const VERIFICATION_STEPS = [
  'Packaging claim evidence',
  'Dispatching to the Gonka Router',
  'Scoring clinical plausibility',
  'Writing attestation to Sui testnet',
  'Applying policy routing rules',
]

export function useVerificationRun() {
  const running = ref(false)
  const stepIndex = ref(0)
  const outcome = ref<VerifyOutcome | null>(null)
  const error = ref<string | null>(null)

  let timer: ReturnType<typeof setInterval> | undefined
  onUnmounted(() => clearInterval(timer))

  async function run(claimId: string, model?: string, comparisonModels?: string[]): Promise<VerifyOutcome | null> {
    running.value = true
    error.value = null
    stepIndex.value = 0

    timer = setInterval(() => {
      if (stepIndex.value < VERIFICATION_STEPS.length - 1) stepIndex.value += 1
    }, 850)

    try {
      const result = await verificationApi.verifyClaim(claimId, model, comparisonModels)
      stepIndex.value = VERIFICATION_STEPS.length
      outcome.value = result
      return result
    } catch (e) {
      // A client-side timeout doesn't mean the call failed — it means this
      // browser stopped waiting. Poll for the real outcome before accepting
      // that as an error: the common case, given how this timeout is sized,
      // is that the backend finishes moments later regardless.
      if (e instanceof ApiError && e.code === 'REQUEST_TIMEOUT') {
        const recovered = await pollForRecovery(claimId)
        if (recovered) {
          stepIndex.value = VERIFICATION_STEPS.length
          outcome.value = recovered
          return recovered
        }
      }
      error.value = e instanceof Error ? e.message : 'Verification could not be completed.'
      return null
    } finally {
      clearInterval(timer)
      running.value = false
    }
  }

  return { running, stepIndex, outcome, error, run }
}
