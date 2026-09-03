import { onUnmounted, ref } from 'vue'
import * as verificationApi from '@/lib/api/verification'
import type { VerifyOutcome } from '@/lib/api/verification'

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

  async function run(claimId: string): Promise<VerifyOutcome | null> {
    running.value = true
    error.value = null
    stepIndex.value = 0

    timer = setInterval(() => {
      if (stepIndex.value < VERIFICATION_STEPS.length - 1) stepIndex.value += 1
    }, 850)

    try {
      const result = await verificationApi.verifyClaim(claimId)
      stepIndex.value = VERIFICATION_STEPS.length
      outcome.value = result
      return result
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Verification could not be completed.'
      return null
    } finally {
      clearInterval(timer)
      running.value = false
    }
  }

  return { running, stepIndex, outcome, error, run }
}
