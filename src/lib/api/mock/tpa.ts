import type {
  Claim,
  InsuranceDashboard,
  ListQuery,
  Paginated,
  Patient,
  Payment,
  Policy,
} from '@/lib/types'
import { claims } from '@/lib/mock-data/claims'
import { policies } from '@/lib/mock-data/policies'
import { payments } from '@/lib/mock-data/payments'
import { patients } from '@/lib/mock-data/users'
import { now } from '@/lib/mock-data/_time'
import { badRequest, byNewest, matchesQuery, notFound, respond, respondList } from '../client'
import { appendEvent, claimRef, ensurePayment } from './_store'

/**
 * Mirrors the TPA's routes — the delegated review queue. `tpaId` stands in for
 * the org the bearer token resolves to. See `mock/insurance.ts` for the
 * insurer's narrower, escalated-only counterpart.
 */

const visibleToTpa = (claim: Claim, tpaId: string) => claim.tpaId === tpaId && claim.status !== 'created'

/** Whether this TPA may decide `claim` alone, per the policy's insurer-set
 * ceiling. A policy with no delegation is never within limit. */
function withinTpaLimit(claim: Claim): boolean {
  const policy = policies.find((p) => p.id === claim.policyId)
  const limit = policy?.tpaApprovalLimit
  return limit != null && claim.amountRequested <= limit
}

/** GET /api/tpa/dashboard */
export async function getDashboard(tpaId: string): Promise<InsuranceDashboard> {
  const mine = claims.filter((c) => visibleToTpa(c, tpaId))
  const queue = mine.filter(
    (c) => c.status === 'submitted' || (c.status === 'pending_review' && withinTpaLimit(c)),
  )
  const count = (...statuses: Claim['status'][]) =>
    mine.filter((c) => statuses.includes(c.status)).length

  const paymentPending = mine.filter(
    (c) => (c.status === 'approved' || c.status === 'auto_approved') && c.paymentId !== null,
  )
  const settled = mine.filter((c) => c.status === 'paid' || c.status === 'closed')
  const decided = mine.filter((c) =>
    ['auto_approved', 'approved', 'rejected', 'paid', 'closed'].includes(c.status),
  )
  const autoDecided = decided.filter((c) => c.decision?.reviewerName === 'WayFare auto-approval')

  const myClaimIds = new Set(mine.map((c) => c.id))
  const myPayments = payments.filter((p) => myClaimIds.has(p.claimId))

  return respond({
    pendingVerification: count('submitted'),
    requiresReview: queue.filter((c) => c.status === 'pending_review').length,
    approved: count('approved', 'auto_approved'),
    rejected: count('rejected'),
    paymentPending: paymentPending.length,
    settled: settled.length,
    exposureAmount: myPayments
      .filter((p) => p.status !== 'completed')
      .reduce((total, p) => total + p.amount, 0),
    settledAmount: myPayments
      .filter((p) => p.status === 'completed')
      .reduce((total, p) => total + p.amount, 0),
    autoApprovalRate: decided.length
      ? Math.round((autoDecided.length / decided.length) * 100)
      : 0,
    reviewQueue: [...queue].sort(byNewest((c) => c.updatedAt)),
  })
}

/** GET /api/tpa/claims */
export async function getClaims(tpaId: string, query: ListQuery = {}): Promise<Paginated<Claim>> {
  const rows = claims
    .filter((c) => visibleToTpa(c, tpaId))
    .filter((c) => (query.status ? c.status === query.status : true))
    .filter((c) =>
      matchesQuery(query.q, c.claimNumber, c.patientName, c.hospitalName, c.diagnosis),
    )
    .sort(byNewest((c) => c.updatedAt))
  return respondList(rows, query)
}

/** The TPA's own decidable queue — only claims within its delegated limit. */
export async function getReviewQueue(tpaId: string, query: ListQuery = {}): Promise<Paginated<Claim>> {
  const rows = claims
    .filter((c) => visibleToTpa(c, tpaId) && c.status === 'pending_review' && withinTpaLimit(c))
    .filter((c) => matchesQuery(query.q, c.claimNumber, c.patientName, c.hospitalName, c.diagnosis))
    .sort(byNewest((c) => c.updatedAt))
  return respondList(rows, query)
}

export interface TpaClaimDetail {
  claim: Claim
  policy: Policy
  patient: Patient | null
}

/** GET /api/tpa/claims/:claimId */
export async function getClaimById(tpaId: string, claimId: string): Promise<TpaClaimDetail> {
  const claim = claims.find((c) => c.id === claimId && visibleToTpa(c, tpaId))
  if (!claim) throw notFound('Claim', claimId)
  const policy = policies.find((p) => p.id === claim.policyId)
  if (!policy) throw notFound('Policy', claim.policyId)
  return respond({
    claim,
    policy,
    patient: patients.find((p) => p.id === claim.patientId) ?? null,
  })
}

const DECIDABLE = new Set(['verified', 'pending_review'])

function assertDecidable(claim: Claim): void {
  if (!DECIDABLE.has(claim.status)) {
    throw badRequest(
      `Claim ${claim.claimNumber} is "${claim.status}" and is no longer open for a decision.`,
    )
  }
}

/** POST /api/tpa/claims/:claimId/approve */
export async function approveClaim(
  tpaId: string,
  claimId: string,
  reviewerName: string,
  body: { reason: string; approvedAmount?: number },
): Promise<Claim> {
  const claim = claimRef(claimId)
  if (claim.tpaId !== tpaId) throw notFound('Claim', claimId)
  assertDecidable(claim)
  if (!body.reason.trim()) throw badRequest('An approval must record a reason.')
  if (!withinTpaLimit(claim)) {
    throw badRequest(
      'This claim exceeds your delegated approval limit — it must be decided by the insurer.',
    )
  }

  const policy = policies.find((p) => p.id === claim.policyId)
  const fallback = Math.max(0, claim.amountRequested - (policy?.deductible ?? 0))
  const approvedAmount = body.approvedAmount ?? fallback

  if (approvedAmount < 0 || approvedAmount > claim.amountRequested) {
    throw badRequest('The approved amount must be between zero and the amount claimed.')
  }

  claim.status = 'approved'
  claim.amountApproved = approvedAmount
  claim.decision = {
    outcome: 'approved',
    reason: body.reason.trim(),
    reviewerName,
    decidedAt: now(),
    approvedAmount,
  }
  appendEvent(
    claim,
    'approved',
    'Approved by TPA',
    `RM${approvedAmount.toLocaleString('en-MY')} payable${policy ? ` after the RM${policy.deductible.toLocaleString('en-MY')} deductible` : ''}.`,
    reviewerName,
    'tpa',
  )
  ensurePayment(claim)

  return respond(claim, 400, 700)
}

/** POST /api/tpa/claims/:claimId/reject */
export async function rejectClaim(
  tpaId: string,
  claimId: string,
  reviewerName: string,
  body: { reason: string },
): Promise<Claim> {
  const claim = claimRef(claimId)
  if (claim.tpaId !== tpaId) throw notFound('Claim', claimId)
  assertDecidable(claim)
  if (!body.reason.trim()) throw badRequest('A rejection must record a reason.')
  if (!withinTpaLimit(claim)) {
    throw badRequest(
      'This claim exceeds your delegated approval limit — it must be decided by the insurer.',
    )
  }

  claim.status = 'rejected'
  claim.amountApproved = 0
  claim.decision = {
    outcome: 'rejected',
    reason: body.reason.trim(),
    reviewerName,
    decidedAt: now(),
    approvedAmount: 0,
  }
  appendEvent(claim, 'rejected', 'Rejected by TPA', body.reason.trim(), reviewerName, 'tpa')

  return respond(claim, 400, 700)
}

/** POST /api/tpa/claims/:claimId/request-review */
export async function requestMoreInfo(
  tpaId: string,
  claimId: string,
  reviewerName: string,
  body: { reason: string },
): Promise<Claim> {
  const claim = claimRef(claimId)
  if (claim.tpaId !== tpaId) throw notFound('Claim', claimId)
  assertDecidable(claim)
  if (!body.reason.trim()) throw badRequest('Describe what additional information is needed.')

  claim.status = 'pending_review'
  claim.decision = {
    outcome: 'more_info_requested',
    reason: body.reason.trim(),
    reviewerName,
    decidedAt: now(),
  }
  appendEvent(
    claim,
    'pending_review',
    'More information requested',
    body.reason.trim(),
    reviewerName,
    'tpa',
  )

  return respond(claim, 350, 600)
}

/** GET /api/tpa/payments — payments for the claims this TPA administers. A
 * TPA is neither payer nor payee, so this is scoped through the claim. */
export async function getPayments(tpaId: string, query: ListQuery = {}): Promise<Paginated<Payment>> {
  const myClaimIds = new Set(claims.filter((c) => c.tpaId === tpaId).map((c) => c.id))
  const rows = payments
    .filter((p) => myClaimIds.has(p.claimId))
    .filter((p) => (query.status ? p.status === query.status : true))
    .filter((p) => matchesQuery(query.q, p.paymentReference, p.claimNumber, p.patientName, p.payeeName))
    .sort(byNewest((p) => p.createdAt))
  return respondList(rows, query)
}
