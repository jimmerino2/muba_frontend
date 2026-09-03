import type {
  ActorRole,
  BlockchainRef,
  Claim,
  ClaimStatus,
  MedicalRecord,
  Payment,
  Policy,
  VerificationResult,
} from '@/lib/types'
import { claims } from '@/lib/mock-data/claims'
import { medicalRecords } from '@/lib/mock-data/records'
import { policies } from '@/lib/mock-data/policies'
import { payments, toUsdc } from '@/lib/mock-data/payments'
import { verifications } from '@/lib/mock-data/verification'
import {
  attestationEvents,
  blockchainRefs,
  createRef,
  settlementEvents,
} from '@/lib/mock-data/blockchain'
import { now } from '@/lib/mock-data/_time'
import { conflict, notFound } from './client'

/**
 * Mutation helpers shared by the resource modules. These operate on live store
 * references (never on detached copies) so the demo flow — submit, verify, route,
 * approve, settle — genuinely advances state for the rest of the session.
 */

let seq = 100

function nextId(prefix: string): string {
  seq += 1
  return `${prefix}_${seq}`
}

function nextNumber(prefix: string, count: number): string {
  return `${prefix}-2026-${String(count).padStart(4, '0')}`
}

/* ------------------------------------------------------------- lookups */

export function claimRef(claimId: string): Claim {
  const claim = claims.find((c) => c.id === claimId)
  if (!claim) throw notFound('Claim', claimId)
  return claim
}

export function recordRef(recordId: string): MedicalRecord {
  const record = medicalRecords.find((r) => r.id === recordId)
  if (!record) throw notFound('Medical record', recordId)
  return record
}

export function paymentRef(paymentId: string): Payment {
  const payment = payments.find((p) => p.id === paymentId)
  if (!payment) throw notFound('Payment', paymentId)
  return payment
}

export function policyRef(policyId: string): Policy {
  const policy = policies.find((p) => p.id === policyId)
  if (!policy) throw notFound('Policy', policyId)
  return policy
}

/* -------------------------------------------------------------- events */

export function appendEvent(
  claim: Claim,
  status: ClaimStatus,
  label: string,
  detail: string,
  actor: string,
  actorRole: ActorRole,
  internal = false,
): void {
  claim.timeline.push({
    id: nextId('evt'),
    status,
    label,
    detail,
    actor,
    actorRole,
    timestamp: now(),
    internal,
  })
  claim.updatedAt = now()
}

/* ------------------------------------------------------- policy routing */

export interface RoutingOutcome {
  status: Extract<ClaimStatus, 'auto_approved' | 'pending_review'>
  reason: string
  scoreCleared: boolean
  amountCleared: boolean
}

/**
 * The single routing rule, used by both the seeded narrative and live actions:
 * a claim auto-approves only when the Truth Score meets the policy threshold AND
 * the amount is within the auto-approval limit. Either failing sends it to a human.
 */
export function evaluateRouting(claim: Claim, verification: VerificationResult): RoutingOutcome {
  const policy = policyRef(claim.policyId)
  const scoreCleared = verification.truthScore >= policy.truthScoreThreshold
  const amountCleared = claim.amountRequested <= policy.autoApproveLimit

  if (scoreCleared && amountCleared) {
    return {
      status: 'auto_approved',
      reason: `Score ${verification.truthScore} ≥ ${policy.truthScoreThreshold} and RM${claim.amountRequested.toLocaleString('en-MY')} ≤ RM${policy.autoApproveLimit.toLocaleString('en-MY')} limit — no human review required.`,
      scoreCleared,
      amountCleared,
    }
  }

  const reasons: string[] = []
  if (!scoreCleared) {
    reasons.push(
      `Truth Score ${verification.truthScore} is below the policy threshold of ${policy.truthScoreThreshold}`,
    )
  }
  if (!amountCleared) {
    reasons.push(
      `RM${claim.amountRequested.toLocaleString('en-MY')} exceeds the RM${policy.autoApproveLimit.toLocaleString('en-MY')} auto-approval limit`,
    )
  }
  return {
    status: 'pending_review',
    reason: `${reasons.join('; and ')}. Assigned to the medical assessment queue.`,
    scoreCleared,
    amountCleared,
  }
}

/* ------------------------------------------------------- verification */

export function storeVerification(result: VerificationResult): void {
  verifications[result.claimId] = result
}

export function verificationFor(claimId: string): VerificationResult | null {
  return verifications[claimId] ?? null
}

/** Writes the verification attestation on chain, mirroring the real settlement flow. */
export function attestOnChain(claim: Claim, verification: VerificationResult): BlockchainRef {
  const ref = createRef({
    id: nextId('bc'),
    kind: 'claim_attestation',
    claimId: claim.id,
    paymentId: null,
    events: attestationEvents(claim.claimNumber, verification.truthScore, verification.requestId),
  })
  blockchainRefs.push(ref)
  return ref
}

/* ----------------------------------------------------------- payments */

/** Creates the pending payment that an approval implies. Idempotent per claim. */
export function ensurePayment(claim: Claim): Payment {
  if (claim.paymentId) return paymentRef(claim.paymentId)

  const policy = policyRef(claim.policyId)
  const amount = claim.amountApproved ?? Math.max(0, claim.amountRequested - policy.deductible)
  const payment: Payment = {
    id: nextId('pay'),
    paymentReference: nextNumber('PAY', payments.length + 41),
    claimId: claim.id,
    claimNumber: claim.claimNumber,
    payerId: claim.insurerId,
    payerName: claim.insurerName,
    payeeId: claim.hospitalId,
    payeeName: claim.hospitalName,
    patientName: claim.patientName,
    amount,
    currency: 'MYR',
    amountUsdc: toUsdc(amount),
    status: 'pending',
    method: 'Sui · USDC (sponsored)',
    createdAt: now(),
    initiatedAt: null,
    settledAt: null,
    failureReason: null,
    transactionId: null,
  }
  payments.push(payment)
  claim.paymentId = payment.id
  return payment
}

/** Settles a payment on the (mocked) Sui testnet and advances its claim to `paid`. */
export function settleOnChain(payment: Payment): BlockchainRef {
  if (payment.status === 'completed') {
    throw conflict(`Payment ${payment.paymentReference} has already settled.`)
  }

  const ref = createRef({
    id: nextId('bc'),
    kind: 'settlement',
    claimId: payment.claimId,
    paymentId: payment.id,
    events: settlementEvents(
      payment.claimNumber,
      payment.amount,
      payment.amountUsdc,
      payment.payeeName,
    ),
  })
  blockchainRefs.push(ref)

  payment.status = 'completed'
  payment.initiatedAt = payment.initiatedAt ?? now()
  payment.settledAt = now()
  payment.failureReason = null
  payment.transactionId = ref.id

  const claim = claimRef(payment.claimId)
  claim.status = 'paid'
  appendEvent(
    claim,
    'paid',
    'Settled on Sui',
    `RM${payment.amount.toLocaleString('en-MY')} (${payment.amountUsdc.toLocaleString('en-MY', { minimumFractionDigits: 2 })} USDC) transferred to ${payment.payeeName}.`,
    'Sui testnet',
    'sui',
  )

  return ref
}

/* --------------------------------------------------------- id helpers */

export { nextId, nextNumber }
