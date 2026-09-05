import type {
  Claim,
  InsuranceDashboard,
  ListQuery,
  Paginated,
  Patient,
  Policy,
} from '@/lib/types'
import { claims } from '@/lib/mock-data/claims'
import { policies } from '@/lib/mock-data/policies'
import { payments } from '@/lib/mock-data/payments'
import { organizations, patients } from '@/lib/mock-data/users'
import { now } from '@/lib/mock-data/_time'
import {
  badRequest,
  byNewest,
  matchesQuery,
  notFound,
  respond,
  respondList,
} from '../client'
import { appendEvent, claimRef, ensurePayment, nextId } from './_store'

/**
 * Mirrors the insurer routes. `insurerId` stands in for the org the bearer token
 * resolves to.
 *
 *   GET   /api/insurance/dashboard
 *   GET   /api/insurance/claims[/:claimId]
 *   POST  /api/insurance/claims/:claimId/approve|reject|request-review
 *   GET   /api/insurance/policies[/:policyId]
 *   POST  /api/insurance/policies
 *   PATCH /api/insurance/policies/:policyId
 */

/** Drafts belong to the provider; an insurer never sees a claim that was not submitted. */
const visibleToInsurer = (claim: Claim, insurerId: string) =>
  claim.insurerId === insurerId && claim.status !== 'created'

/**
 * Whether a `pending_review` claim has escalated past its TPA's delegated
 * limit and so belongs in the insurer's own queue. A claim with no TPA on
 * file always escalates — there is no one else to decide it.
 */
function isEscalatedToInsurer(claim: Claim): boolean {
  const policy = policies.find((p) => p.id === claim.policyId)
  const limit = policy?.tpaApprovalLimit
  return limit == null || claim.amountRequested > limit
}

/** GET /api/insurance/dashboard */
export async function getDashboard(insurerId: string): Promise<InsuranceDashboard> {
  const mine = claims.filter((c) => visibleToInsurer(c, insurerId))
  const escalatedQueue = mine.filter(
    (c) => c.status === 'submitted' || (c.status === 'pending_review' && isEscalatedToInsurer(c)),
  )
  const count = (...statuses: Claim['status'][]) =>
    mine.filter((c) => statuses.includes(c.status)).length

  // "Payment pending" is any claim cleared for payout that has not settled yet.
  const paymentPending = mine.filter(
    (c) => (c.status === 'approved' || c.status === 'auto_approved') && c.paymentId !== null,
  )
  const settled = mine.filter((c) => c.status === 'paid' || c.status === 'closed')
  const decided = mine.filter((c) =>
    ['auto_approved', 'approved', 'rejected', 'paid', 'closed'].includes(c.status),
  )
  const autoDecided = decided.filter((c) => c.decision?.reviewerName === 'WayFare auto-approval')

  const myPayments = payments.filter((p) => p.payerId === insurerId)

  return respond({
    pendingVerification: count('submitted'),
    // Only the escalated slice — matches what's actually actionable below.
    requiresReview: escalatedQueue.filter((c) => c.status === 'pending_review').length,
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
    reviewQueue: [...escalatedQueue].sort(byNewest((c) => c.updatedAt)),
  })
}

/** GET /api/insurance/claims */
export async function getClaims(
  insurerId: string,
  query: ListQuery = {},
): Promise<Paginated<Claim>> {
  const rows = claims
    .filter((c) => visibleToInsurer(c, insurerId))
    .filter((c) => (query.status ? c.status === query.status : true))
    .filter((c) =>
      matchesQuery(query.q, c.claimNumber, c.patientName, c.hospitalName, c.diagnosis),
    )
    .sort(byNewest((c) => c.updatedAt))
  return respondList(rows, query)
}

/**
 * The insurer's own review queue — narrower than `getClaims(insurerId, {
 * status: 'pending_review' })`. Only claims that have escalated past their
 * TPA's delegated limit (or carry no TPA delegation) show up here.
 */
export async function getReviewQueue(
  insurerId: string,
  query: ListQuery = {},
): Promise<Paginated<Claim>> {
  const rows = claims
    .filter((c) => visibleToInsurer(c, insurerId) && c.status === 'pending_review')
    .filter(isEscalatedToInsurer)
    .filter((c) => matchesQuery(query.q, c.claimNumber, c.patientName, c.hospitalName, c.diagnosis))
    .sort(byNewest((c) => c.updatedAt))
  return respondList(rows, query)
}

export interface InsuranceClaimDetail {
  claim: Claim
  policy: Policy
  patient: Patient | null
}

/** GET /api/insurance/claims/:claimId — claim plus the policy and patient context. */
export async function getClaimById(
  insurerId: string,
  claimId: string,
): Promise<InsuranceClaimDetail> {
  const claim = claims.find((c) => c.id === claimId && visibleToInsurer(c, insurerId))
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

/** POST /api/insurance/claims/:claimId/approve */
export async function approveClaim(
  insurerId: string,
  claimId: string,
  reviewerName: string,
  body: { reason: string; approvedAmount?: number },
): Promise<Claim> {
  const claim = claimRef(claimId)
  if (claim.insurerId !== insurerId) throw notFound('Claim', claimId)
  assertDecidable(claim)
  if (!body.reason.trim()) throw badRequest('An approval must record a reason.')

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
    'Approved by assessor',
    `RM${approvedAmount.toLocaleString('en-MY')} payable${policy ? ` after the RM${policy.deductible.toLocaleString('en-MY')} deductible` : ''}.`,
    reviewerName,
    'insurance',
  )
  ensurePayment(claim)

  return respond(claim, 400, 700)
}

/** POST /api/insurance/claims/:claimId/reject */
export async function rejectClaim(
  insurerId: string,
  claimId: string,
  reviewerName: string,
  body: { reason: string },
): Promise<Claim> {
  const claim = claimRef(claimId)
  if (claim.insurerId !== insurerId) throw notFound('Claim', claimId)
  assertDecidable(claim)
  if (!body.reason.trim()) throw badRequest('A rejection must record a reason.')

  claim.status = 'rejected'
  claim.amountApproved = 0
  claim.decision = {
    outcome: 'rejected',
    reason: body.reason.trim(),
    reviewerName,
    decidedAt: now(),
    approvedAmount: 0,
  }
  appendEvent(claim, 'rejected', 'Rejected by assessor', body.reason.trim(), reviewerName, 'insurance')

  return respond(claim, 400, 700)
}

export interface LineItemDecision {
  lineItemId: string
  approved: boolean
  reason?: string
}

/** POST /api/insurance/claims/:claimId/review with per-line-item decisions —
 * mirrors live/insurance.ts decideLineItems' derivation of the claim-level
 * approved/denied totals and status from the individual items. */
export async function decideLineItems(
  insurerId: string,
  claimId: string,
  reviewerName: string,
  decisions: LineItemDecision[],
): Promise<Claim> {
  const claim = claimRef(claimId)
  if (claim.insurerId !== insurerId) throw notFound('Claim', claimId)
  assertDecidable(claim)
  if (decisions.length === 0) throw badRequest('Decide at least one line item.')
  if (decisions.length !== claim.lineItems.length || !decisions.every((d) => claim.lineItems.some((li) => li.id === d.lineItemId))) {
    throw badRequest('Every line item on this claim must be decided exactly once.')
  }
  const deniedWithoutReason = decisions.find((d) => !d.approved && !d.reason?.trim())
  if (deniedWithoutReason) throw badRequest('A denied line item must record a reason.')

  claim.lineItems = claim.lineItems.map((item) => {
    const decision = decisions.find((d) => d.lineItemId === item.id)!
    return { ...item, approved: decision.approved, denied: !decision.approved, reason: decision.reason?.trim() || null }
  })
  const approvedAmount = claim.lineItems.filter((li) => li.approved).reduce((total, li) => total + li.amount, 0)
  const deniedAmount = claim.lineItems.filter((li) => li.denied).reduce((total, li) => total + li.amount, 0)

  claim.status = approvedAmount > 0 ? 'approved' : 'rejected'
  claim.amountApproved = approvedAmount > 0 ? approvedAmount : null
  claim.amountDenied = deniedAmount
  claim.patientResponsibility = Math.max(claim.amountRequested - approvedAmount, 0)
  claim.decision = {
    outcome: approvedAmount > 0 ? 'approved' : 'rejected',
    reason: decisions.find((d) => !d.approved)?.reason?.trim() || 'Reviewed line by line.',
    reviewerName,
    decidedAt: now(),
    approvedAmount,
  }
  appendEvent(
    claim,
    claim.status,
    approvedAmount > 0 ? 'Approved by assessor' : 'Rejected by assessor',
    `Approved ${approvedAmount.toLocaleString('en-MY')}, denied ${deniedAmount.toLocaleString('en-MY')} across ${claim.lineItems.length} line item(s).`,
    reviewerName,
    'insurance',
  )
  if (approvedAmount > 0) ensurePayment(claim)

  return respond(claim, 400, 700)
}

/**
 * POST /api/insurance/claims/:claimId/request-review
 *
 * Sends the claim back to the provider for more information. It stays in
 * `pending_review` — the query is recorded on the timeline rather than moving the
 * claim into a status that only exists for one role.
 */
export async function requestMoreInfo(
  insurerId: string,
  claimId: string,
  reviewerName: string,
  body: { reason: string },
): Promise<Claim> {
  const claim = claimRef(claimId)
  if (claim.insurerId !== insurerId) throw notFound('Claim', claimId)
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
    'insurance',
  )

  return respond(claim, 350, 600)
}

/**
 * GET /api/insurance/members
 *
 * NOT in the documented route list — the policy create form needs an insured-party
 * picker and no existing route exposes one. Flagged here so the backend contract
 * gains this route (or the form is repointed) when the mock layer is swapped out.
 */
export async function getMembers(query: ListQuery = {}): Promise<Paginated<Patient>> {
  const rows = patients.filter((p) => matchesQuery(query.q, p.name, p.email, p.nationalId))
  return respondList(rows, query)
}

/** GET /api/insurance/policies */
export async function getPolicies(
  insurerId: string,
  query: ListQuery = {},
): Promise<Paginated<Policy>> {
  const rows = policies
    .filter((p) => p.insurerId === insurerId)
    .filter((p) => (query.status ? p.status === query.status : true))
    .filter((p) => matchesQuery(query.q, p.policyNumber, p.holderName, p.coverageType))
  return respondList(rows, query)
}

/** GET /api/insurance/policies/:policyId */
export async function getPolicyById(insurerId: string, policyId: string): Promise<Policy> {
  const policy = policies.find((p) => p.id === policyId && p.insurerId === insurerId)
  if (!policy) throw notFound('Policy', policyId)
  return respond(policy)
}

export type PolicyPayload = Omit<
  Policy,
  'id' | 'insurerId' | 'insurerName' | 'holderName' | 'tpaName' | 'currency'
>

/** GET /api/identity/organizations?type=TPA */
export async function listTpaOrganizations(): Promise<{ id: string; name: string }[]> {
  const rows = organizations.filter((o) => o.type === 'tpa').map((o) => ({ id: o.id, name: o.name }))
  return respond(rows)
}

/** POST /api/insurance/policies */
export async function createPolicy(
  insurerId: string,
  insurerName: string,
  payload: PolicyPayload,
): Promise<Policy> {
  const holder = patients.find((p) => p.id === payload.holderPatientId)
  if (!holder) throw notFound('Patient', payload.holderPatientId)
  if (policies.some((p) => p.policyNumber === payload.policyNumber)) {
    throw badRequest(`Policy number ${payload.policyNumber} is already in use.`)
  }
  if (payload.autoApproveLimit > payload.coverageLimit) {
    throw badRequest('The auto-approval limit cannot exceed the annual coverage limit.')
  }
  if (payload.tpaApprovalLimit !== null && payload.tpaApprovalLimit > payload.coverageLimit) {
    throw badRequest('The TPA approval limit cannot exceed the annual coverage limit.')
  }

  const tpa = payload.tpaOrganizationId
    ? organizations.find((o) => o.id === payload.tpaOrganizationId)
    : undefined

  const policy: Policy = {
    ...payload,
    id: nextId('pol'),
    insurerId,
    insurerName,
    holderName: holder.name,
    tpaName: tpa?.name ?? null,
    currency: 'MYR',
  }
  policies.push(policy)
  holder.policyIds.push(policy.id)

  return respond(policy, 400, 700)
}

/** PATCH /api/insurance/policies/:policyId */
export async function updatePolicy(
  insurerId: string,
  policyId: string,
  patch: Partial<PolicyPayload>,
): Promise<Policy> {
  const policy = policies.find((p) => p.id === policyId && p.insurerId === insurerId)
  if (!policy) throw notFound('Policy', policyId)

  const merged = { ...policy, ...patch }
  if (merged.autoApproveLimit > merged.coverageLimit) {
    throw badRequest('The auto-approval limit cannot exceed the annual coverage limit.')
  }
  if (patch.holderPatientId && patch.holderPatientId !== policy.holderPatientId) {
    const holder = patients.find((p) => p.id === patch.holderPatientId)
    if (!holder) throw notFound('Patient', patch.holderPatientId)
    merged.holderName = holder.name
  }

  Object.assign(policy, merged)
  return respond(policy, 350, 600)
}
