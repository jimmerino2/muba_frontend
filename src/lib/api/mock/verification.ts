import type { VerificationResult } from '@/lib/types'
import { generateVerification } from '@/lib/mock-data/verification'
import { badRequest, respond } from '../client'
import {
  appendEvent,
  attestOnChain,
  claimRef,
  ensurePayment,
  evaluateRouting,
  policyRef,
  recordRef,
  storeVerification,
  verificationFor,
} from './_store'

/**
 * Mirrors the Gonka Router routes:
 *   POST /api/verification/claims/:claimId   — run verification
 *   GET  /api/verification/claims/:claimId   — fetch an existing result
 *
 * Running verification is the pivot of the whole lifecycle: it produces the Truth
 * Score, writes an attestation on chain, and then applies the policy routing rule
 * that decides between automated clearance and a human assessor.
 */

/** GET /api/verification/claims/:claimId — null when the claim has not been verified. */
export async function getVerification(claimId: string): Promise<VerificationResult | null> {
  claimRef(claimId)
  return respond(verificationFor(claimId))
}

export interface VerifyOutcome {
  verification: VerificationResult
  /** Where the policy engine sent the claim once the score was known. */
  routedTo: 'auto_approved' | 'pending_review'
  routingReason: string
  scoreCleared: boolean
  amountCleared: boolean
  truthScoreThreshold: number
  autoApproveLimit: number
  attestationDigest: string
}

/**
 * POST /api/verification/claims/:claimId
 *
 * Deliberately slower than a data read — this is a model call, and the UI shows a
 * staged progress reveal against it rather than a generic spinner.
 */
export async function verifyClaim(claimId: string, model?: string): Promise<VerifyOutcome> {
  const claim = claimRef(claimId)

  if (claim.status === 'created') {
    throw badRequest(`Claim ${claim.claimNumber} must be submitted before it can be verified.`)
  }
  if (claim.status !== 'submitted') {
    throw badRequest(`Claim ${claim.claimNumber} has already been verified.`)
  }

  const record = recordRef(claim.recordId)
  const policy = policyRef(claim.policyId)

  const verification = generateVerification(claim, record.documents.length, policy.truthScoreThreshold, record.icd10Code)
  // No real Gonka Router behind the mock layer to actually re-run against a
  // different model — reflect the caller's choice on the result so the UI
  // still shows what was picked, same as the live path would.
  if (model) verification.model = model
  storeVerification(verification)

  claim.status = 'verified'
  appendEvent(
    claim,
    'verified',
    'Gonka verification complete',
    `Truth Score ${verification.truthScore} · request ${verification.requestId}.`,
    'Gonka Router',
    'gonka',
  )

  const attestation = attestOnChain(claim, verification)

  const routing = evaluateRouting(claim, verification)
  claim.status = routing.status

  if (routing.status === 'auto_approved') {
    appendEvent(
      claim,
      'auto_approved',
      'Auto-approval threshold met',
      routing.reason,
      'WayFare policy engine',
      'system',
    )
    claim.amountApproved = Math.max(0, claim.amountRequested - policy.deductible)
    claim.decision = {
      outcome: 'approved',
      reason: `Cleared automatically: ${routing.reason} RM${policy.deductible.toLocaleString('en-MY')} policy deductible applied.`,
      reviewerName: 'WayFare auto-approval',
      decidedAt: new Date().toISOString(),
      approvedAmount: claim.amountApproved,
    }
    ensurePayment(claim)
  } else {
    appendEvent(
      claim,
      'pending_review',
      'Routed to human review',
      routing.reason,
      'WayFare policy engine',
      'system',
    )
  }

  await new Promise((resolve) => setTimeout(resolve, 900 + Math.random() * 700))

  return respond(
    {
      verification,
      routedTo: routing.status,
      routingReason: routing.reason,
      scoreCleared: routing.scoreCleared,
      amountCleared: routing.amountCleared,
      truthScoreThreshold: policy.truthScoreThreshold,
      autoApproveLimit: policy.autoApproveLimit,
      attestationDigest: attestation.digest,
    },
    200,
    400,
  )
}
