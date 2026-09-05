import type { VerificationResult } from '@/lib/types'
import { ApiError } from '../client'
import { http } from '../http'
import type { WireClaim, WireGonkaRequest, WireVerifyOutcome } from '../wire'
import { toVerificationResult } from '../adapters'
import { invalidatePayments } from './_resolve'

/**
 * The pivot of the whole lifecycle.
 *
 *   POST /api/verification/claims/:claimId  — run verification
 *   GET  /api/verification/claims/:claimId  — read back the persisted result
 *
 * One call now does considerably more than the mock layer's single Truth Score
 * lookup, and in a deliberate order:
 *
 *   1. the policy check (active, in force, treatment covered, within limits);
 *   2. the **contractual clause assessment** against the insurer's own
 *      transcribed policy document — an AUTO_REJECT exclusion that trips ends
 *      it here, before any model is called;
 *   3. the Gonka call, given the surviving contract terms as grounding context
 *      because the router cannot read the source PDF;
 *   4. a real on-chain attestation of the Truth Score;
 *   5. the auto-decide rule, which is an AND across all three gates — score,
 *      amount, and clauses.
 *
 * That means a `200` here can legitimately carry a rejected claim: the request
 * succeeded, and rejection is the verified outcome. Only a genuine upstream
 * failure (a Gonka timeout, say) is an error — and it leaves the claim
 * retryable rather than stranded.
 */

export async function getVerification(claimId: string): Promise<VerificationResult | null> {
  try {
    const request = await http<WireGonkaRequest>(`/api/verification/claims/${claimId}`)
    return request ? toVerificationResult(request) : null
  } catch (error) {
    // A 404 means "not verified yet", which is a normal state for a claim, not
    // a failure the view should render as an error.
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

export interface VerifyOutcome {
  verification: VerificationResult
  /** Where the decision rules sent the claim once every gate had been applied. */
  routedTo: 'auto_approved' | 'pending_review'
  routingReason: string
  scoreCleared: boolean
  amountCleared: boolean
  truthScoreThreshold: number
  autoApproveLimit: number
  attestationDigest: string
}

/**
 * A claim rejected before Gonka ran — at the policy check or by an AUTO_REJECT
 * clause — has no verification to show. That is not an error, but the caller's
 * `VerifyOutcome` has no room for it, so it is raised as a `409` carrying the
 * backend's own explanation (which cites the clause). The views already render
 * an `ApiError` message, so the reason reaches the screen intact.
 */
export class ClaimRejectedBeforeVerification extends ApiError {
  constructor(
    message: string,
    readonly clauseCode: string | null,
  ) {
    super(409, message, 'REJECTED_BEFORE_VERIFICATION')
    this.name = 'ClaimRejectedBeforeVerification'
  }
}

/** `model` optionally overrides the backend's default Gonka Router model
 * (`GONKA_MODEL`) for this one verification; `comparisonModels` runs
 * additional models against the same claim purely for side-by-side
 * comparison — neither ever changes the routing decision, which is always
 * driven by `model` alone. See `lib/api/gonka.ts` listModels() for what's
 * actually available to offer. */
export async function verifyClaim(
  claimId: string,
  model?: string,
  comparisonModels?: string[],
): Promise<VerifyOutcome> {
  // The Gonka call this triggers has no timeout of its own and is documented
  // as sometimes running 60s+ — bound it client-side so a hung request
  // surfaces a clear, retryable error instead of leaving the caller's UI
  // waiting forever with no feedback (see useVerificationRun.ts and every
  // view that renders VerificationSteps while this is in flight). Running
  // comparison models in the same call adds more of the same kind of wait,
  // not a new failure mode, so the timeout is left as-is.
  const body: Record<string, unknown> = {}
  if (model) body.model = model
  if (comparisonModels && comparisonModels.length > 0) body.comparisonModels = comparisonModels

  const outcome = await http<WireVerifyOutcome>(`/api/verification/claims/${claimId}`, {
    method: 'POST',
    body: Object.keys(body).length > 0 ? body : undefined,
    // Real-world total for this one call: the Gonka call itself (60s+
    // observed), a real Sui attestation, and — since auto-approval now
    // settles synchronously — up to 3 on-chain settlement attempts with
    // backoff between them (see the backend's payment-service.ts
    // executeWithRetry). 90s was cutting it close enough to spuriously time
    // out a request that was actually still going to succeed; 240s gives
    // real headroom. If this still fires, useVerificationRun.ts recovers
    // via recoverVerifyOutcome() rather than just showing the error, since
    // the backend keeps working regardless of whether this client gave up.
    timeoutMs: 240_000,
  })

  const claim = outcome?.claim
  if (!claim) throw new ApiError(502, 'Verification returned no claim.', 'UPSTREAM_UNAVAILABLE')

  // An approval creates a payment as a side effect.
  invalidatePayments()

  if (!outcome.verification) {
    const clause = claim.clauseAssessment?.rejectedByClauseCode ?? null
    const cited = claim.clauseAssessment?.evaluations.find((e) => e.outcome === 'REJECT')
    throw new ClaimRejectedBeforeVerification(
      cited?.explanation ??
        'The claim was rejected on the policy check before verification ran, so no Truth Score was produced.',
      clause,
    )
  }

  const verification = toVerificationResult(outcome.verification)
  const truthScoreThreshold = outcome.verification.threshold
  const scoreCleared = outcome.verification.passesThreshold
  const autoApproveLimit = autoApproveLimitFor(claim)
  const amountCleared = claim.claimAmount <= autoApproveLimit
  const routedTo = claim.status === 'APPROVED' ? 'auto_approved' : 'pending_review'

  return {
    verification,
    routedTo,
    routingReason: routingReason(claim, scoreCleared, amountCleared, autoApproveLimit, truthScoreThreshold),
    scoreCleared,
    amountCleared,
    truthScoreThreshold,
    autoApproveLimit,
    attestationDigest: outcome.verification.attestationDigest ?? '',
  }
}

/**
 * Reconstructs the same VerifyOutcome shape verifyClaim() would have
 * returned, from a plain read — for recovering after that call's own
 * client-side timeout. A timeout means this browser gave up waiting, not
 * that the backend did: verification and (for an auto-approved claim)
 * settlement keep running server-side regardless (see CLAUDE.md "Claim
 * States"), so by the time this is called the real outcome may already be
 * sitting there waiting to be read back. Returns null when there's genuinely
 * nothing to recover yet (claim not found, still VERIFYING, or rejected
 * before any Gonka call ran) — the caller falls back to the original timeout
 * error in that case, since there's nothing more this can tell it.
 */
export async function recoverVerifyOutcome(claimId: string): Promise<VerifyOutcome | null> {
  let claim: WireClaim | undefined
  try {
    claim = await http<WireClaim>(`/api/claims/${claimId}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
  if (!claim || claim.status === 'SUBMITTED' || claim.status === 'VERIFYING') return null

  const verification = await getVerification(claimId)
  if (!verification) return null

  const truthScoreThreshold = verification.threshold
  const scoreCleared = verification.passesThreshold
  const autoApproveLimit = autoApproveLimitFor(claim)
  const amountCleared = claim.claimAmount <= autoApproveLimit
  const routedTo = claim.status === 'APPROVED' ? 'auto_approved' : 'pending_review'

  // A settled/pending payment is the one side effect verifyClaim() itself
  // triggers on success — recovering the same outcome should invalidate the
  // same cached data, or a payments list fetched mid-recovery could still
  // show the pre-settlement state.
  invalidatePayments()

  let attestationDigest = ''
  try {
    const ref = await http<{ digest: string } | null>(`/api/blockchain/claims/${claimId}`)
    attestationDigest = ref?.digest ?? ''
  } catch {
    // Display-only — never block recovery on this.
  }

  return {
    verification,
    routedTo,
    routingReason: routingReason(claim, scoreCleared, amountCleared, autoApproveLimit, truthScoreThreshold),
    scoreCleared,
    amountCleared,
    truthScoreThreshold,
    autoApproveLimit,
    attestationDigest,
  }
}

/**
 * The amount gate the backend actually applied. It is not on the claim, so it
 * is recovered from the clause assessment where a product contract exists (the
 * plan's own limits), and otherwise from the claim amount itself — which is
 * exact whenever the claim cleared, and conservative when it didn't.
 */
function autoApproveLimitFor(claim: WireClaim): number {
  const planLimit = claim.clauseAssessment?.evaluations.find(
    (e) => e.ruleKind === 'DEDUCTIBLE_AND_ROOM_BOARD',
  )?.workings?.overallAnnualLimit
  if (typeof planLimit === 'number') return planLimit
  return claim.claimAmount
}

/** Explains the routing in the same terms the backend recorded it. */
function routingReason(
  claim: WireClaim,
  scoreCleared: boolean,
  amountCleared: boolean,
  autoApproveLimit: number,
  truthScoreThreshold: number,
): string {
  const money = (value: number) => `RM${value.toLocaleString('en-MY')}`

  if (claim.status === 'APPROVED') {
    return (
      `Truth Score ${claim.truthScore} met the ${truthScoreThreshold} threshold, ` +
      `${money(claim.claimAmount)} is within the auto-approval limit, and every contractual clause cleared — ` +
      'no human review required.'
    )
  }

  const reasons: string[] = []
  if (!scoreCleared) {
    reasons.push(`Truth Score ${claim.truthScore} is below the ${truthScoreThreshold} threshold`)
  }
  if (!amountCleared) {
    reasons.push(`${money(claim.claimAmount)} exceeds the ${money(autoApproveLimit)} auto-approval limit`)
  }

  // A clause that needs an assessor is the most specific reason available, so
  // it is stated with its clause number rather than folded into a generic line.
  const clauseReasons = (claim.clauseAssessment?.evaluations ?? [])
    .filter((e) => e.outcome === 'REVIEW' || e.outcome === 'INCONCLUSIVE')
    .map((e) => `clause ${e.clauseCode} (${e.title}) needs an assessor: ${e.explanation}`)
  reasons.push(...clauseReasons)

  if (reasons.length === 0) {
    return 'Assigned to the medical assessment queue.'
  }
  return `${reasons.join('; and ')}. Assigned to the medical assessment queue.`
}
