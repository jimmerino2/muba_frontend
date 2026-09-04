import type { VerificationResult } from '@/lib/types'
import { ApiError } from '../client'
import { http } from '../http'
import type { WireClaim, WireGonkaRequest, WireVerifyOutcome } from '../wire'
import { toVerificationResult } from '../adapters'
import { invalidatePayments } from './_resolve'
import { TRUTH_SCORE_THRESHOLD } from './config'

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

export async function verifyClaim(claimId: string): Promise<VerifyOutcome> {
  const outcome = await http<WireVerifyOutcome>(`/api/verification/claims/${claimId}`, {
    method: 'POST',
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
  const scoreCleared = verification.truthScore >= TRUTH_SCORE_THRESHOLD
  const autoApproveLimit = autoApproveLimitFor(claim)
  const amountCleared = claim.claimAmount <= autoApproveLimit
  const routedTo = claim.status === 'APPROVED' ? 'auto_approved' : 'pending_review'

  return {
    verification,
    routedTo,
    routingReason: routingReason(claim, scoreCleared, amountCleared, autoApproveLimit),
    scoreCleared,
    amountCleared,
    truthScoreThreshold: TRUTH_SCORE_THRESHOLD,
    autoApproveLimit,
    attestationDigest: outcome.verification.attestationDigest ?? '',
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
): string {
  const money = (value: number) => `RM${value.toLocaleString('en-MY')}`

  if (claim.status === 'APPROVED') {
    return (
      `Truth Score ${claim.truthScore} met the ${TRUTH_SCORE_THRESHOLD} threshold, ` +
      `${money(claim.claimAmount)} is within the auto-approval limit, and every contractual clause cleared — ` +
      'no human review required.'
    )
  }

  const reasons: string[] = []
  if (!scoreCleared) {
    reasons.push(`Truth Score ${claim.truthScore} is below the ${TRUTH_SCORE_THRESHOLD} threshold`)
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
