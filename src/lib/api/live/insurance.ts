import type {
  Claim,
  InsuranceDashboard,
  ListQuery,
  Paginated,
  Patient,
  Policy,
} from '@/lib/types'
import { badRequest, notFound } from '../client'
import { http, paginate } from '../http'
import type { WireClaim, WirePatient, WirePayment, WirePolicy } from '../wire'
import { toClaim, toPatient, toPolicy } from '../adapters'
import { cache, claimEvents, claimNames, invalidatePayments, organizationName, patientName } from './_resolve'
import { TRUTH_SCORE_THRESHOLD } from './config'

/**
 * The insurer view — the review queue, the decisions, and the book of policies.
 *
 *   GET  /api/claims[/:id]
 *   POST /api/claims/:id/review     (approve | reject)
 *   GET  /api/policies[/:id]
 *   POST /api/policies
 *   GET  /api/patients              (the insured-party picker)
 *
 * Two things the backend does not have, and how they are handled:
 *
 *   - **No `GET /api/insurance/dashboard`.** `getDashboard` composes the same
 *     counts from the claims and payments lists, so the tiles and the tables
 *     can never disagree.
 *   - **No "request more information" transition.** The backend's review
 *     endpoint takes `approve` or `reject` only, and deliberately: a third
 *     outcome would be a claim state that exists for one role, which CLAUDE.md
 *     rules out. `requestMoreInfo` therefore records the query without moving
 *     the claim, and says so rather than pretending a transition happened.
 */

function matches(query: string | undefined, ...fields: (string | null | undefined)[]): boolean {
  if (!query?.trim()) return true
  const needle = query.trim().toLowerCase()
  return fields.some((field) => (field ?? '').toLowerCase().includes(needle))
}

const newestFirst = <T>(pick: (item: T) => string) => (a: T, b: T) =>
  Date.parse(pick(b)) - Date.parse(pick(a))

/** A draft belongs to the provider; an insurer never sees an unsubmitted claim. */
const visibleToInsurer = (claim: WireClaim, insurerId: string) =>
  claim.insuranceOrganizationId === insurerId && claim.status !== 'CREATED'

async function hydrateClaim(claim: WireClaim, withEvents = true): Promise<Claim> {
  const [names, events] = await Promise.all([
    claimNames(claim),
    withEvents ? claimEvents(claim.id) : Promise.resolve([]),
  ])
  return toClaim(claim, names, events)
}

/**
 * Whether a `REQUIRES_REVIEW` claim has escalated past its TPA's delegated
 * limit and so belongs in the insurer's own queue rather than the TPA's.
 * A claim with no TPA on file (no delegation exists) always escalates — there
 * is no one else to decide it.
 */
async function isEscalatedToInsurer(claim: WireClaim): Promise<boolean> {
  const policy = await cache.policies.get(claim.policyId)
  const limit = policy?.coverageRules.tpaApprovalLimit
  return limit === null || limit === undefined || claim.claimAmount > limit
}

/* ------------------------------------------------------------ dashboard */

export async function getDashboard(insurerId: string): Promise<InsuranceDashboard> {
  const [wireClaims, wirePayments] = await Promise.all([
    http<WireClaim[]>('/api/claims'),
    http<WirePayment[]>('/api/payments'),
  ])

  const visible = (wireClaims ?? []).filter((c) => visibleToInsurer(c, insurerId))

  // The review queue is the only place a timeline is needed on a list — the
  // queue shows *why* each claim was routed to a human, read off the routing
  // event. Everything else in this dashboard is counts, so events are skipped.
  //
  // A `REQUIRES_REVIEW` claim only belongs in the insurer's own queue once it
  // has escalated past its TPA's delegated limit — anything still within that
  // limit is the TPA's to decide, not shown here as actionable.
  const notYetRouted = visible.filter((c) => c.status === 'SUBMITTED' || c.status === 'VERIFYING')
  const requiresReview = visible.filter((c) => c.status === 'REQUIRES_REVIEW')
  const escalated = await Promise.all(requiresReview.map(isEscalatedToInsurer))
  const queueSource = [...notYetRouted, ...requiresReview.filter((_, i) => escalated[i])]

  const [claims, reviewQueue] = await Promise.all([
    Promise.all(visible.map((c) => hydrateClaim(c, false))),
    Promise.all(queueSource.map((c) => hydrateClaim(c, true))),
  ])

  const count = (...statuses: Claim['status'][]) =>
    claims.filter((c) => statuses.includes(c.status)).length

  const paymentPending = claims.filter(
    (c) => (c.status === 'approved' || c.status === 'auto_approved') && c.paymentId !== null,
  )
  const settled = claims.filter((c) => c.status === 'paid' || c.status === 'closed')
  const decided = claims.filter((c) =>
    ['auto_approved', 'approved', 'rejected', 'paid', 'closed'].includes(c.status),
  )
  // Read off the backend's own `approvedAutomatically` flag rather than
  // inferred from a reviewer name, so the rate matches what was recorded.
  const autoDecided = visible.filter((c) => c.approvedAutomatically === true)

  const myPayments = (wirePayments ?? []).filter((p) => p.payerOrganizationId === insurerId)

  return {
    pendingVerification: count('submitted'),
    // Only the escalated slice — the count matches what's actually actionable
    // in this insurer's own review queue below.
    requiresReview: queueSource.filter((c) => c.status === 'REQUIRES_REVIEW').length,
    approved: count('approved', 'auto_approved'),
    rejected: count('rejected'),
    paymentPending: paymentPending.length,
    settled: settled.length,
    exposureAmount: myPayments
      .filter((p) => p.status !== 'SETTLED')
      .reduce((total, p) => total + p.amount, 0),
    settledAmount: myPayments
      .filter((p) => p.status === 'SETTLED')
      .reduce((total, p) => total + p.amount, 0),
    autoApprovalRate: decided.length ? Math.round((autoDecided.length / decided.length) * 100) : 0,
    reviewQueue: reviewQueue.sort(newestFirst((c) => c.updatedAt)),
  }
}

/* ---------------------------------------------------------------- claims */

export async function getClaims(
  insurerId: string,
  query: ListQuery = {},
): Promise<Paginated<Claim>> {
  const wire = await http<WireClaim[]>('/api/claims')
  const claims = await Promise.all(
    (wire ?? []).filter((c) => visibleToInsurer(c, insurerId)).map((c) => hydrateClaim(c)),
  )
  const rows = claims
    .filter((c) => (query.status ? c.status === query.status : true))
    .filter((c) => matches(query.q, c.claimNumber, c.patientName, c.hospitalName, c.diagnosis))
    .sort(newestFirst((c) => c.updatedAt))
  return paginate(rows, query)
}

/**
 * The insurer's own review queue — deliberately narrower than
 * `getClaims(insurerId, { status: 'pending_review' })`. A claim only reaches
 * here once it has escalated past its administering TPA's delegated approval
 * limit (or carries no TPA delegation at all); anything still within that
 * limit sits in the TPA's own queue instead.
 */
export async function getReviewQueue(
  insurerId: string,
  query: ListQuery = {},
): Promise<Paginated<Claim>> {
  const wire = await http<WireClaim[]>('/api/claims')
  const candidates = (wire ?? []).filter(
    (c) => visibleToInsurer(c, insurerId) && c.status === 'REQUIRES_REVIEW',
  )
  const escalated = await Promise.all(candidates.map(isEscalatedToInsurer))
  const claims = await Promise.all(
    candidates.filter((_, i) => escalated[i]).map((c) => hydrateClaim(c)),
  )
  const rows = claims
    .filter((c) => matches(query.q, c.claimNumber, c.patientName, c.hospitalName, c.diagnosis))
    .sort(newestFirst((c) => c.updatedAt))
  return paginate(rows, query)
}

export interface InsuranceClaimDetail {
  claim: Claim
  policy: Policy
  patient: Patient | null
}

export async function getClaimById(
  insurerId: string,
  claimId: string,
): Promise<InsuranceClaimDetail> {
  const wire = await http<WireClaim>(`/api/claims/${claimId}`)
  if (!wire || !visibleToInsurer(wire, insurerId)) throw notFound('Claim', claimId)

  const [claim, wirePolicy] = await Promise.all([
    hydrateClaim(wire),
    cache.policies.get(wire.policyId),
  ])
  if (!wirePolicy) throw notFound('Policy', wire.policyId)

  const wirePatient = await cache.patients.get(wire.patientRef)
  const [insurerName, tpaName] = await Promise.all([
    organizationName(wirePolicy.insuranceOrganizationId),
    wirePolicy.tpaOrganizationId ? organizationName(wirePolicy.tpaOrganizationId) : Promise.resolve(null),
  ])

  return {
    claim,
    policy: toPolicy(
      wirePolicy,
      { insurerName, holderName: wirePatient?.name ?? claim.patientName, tpaName },
      TRUTH_SCORE_THRESHOLD,
    ),
    patient: wirePatient ? toPatient(wirePatient) : null,
  }
}

/* -------------------------------------------------------------- decisions */

const DECIDABLE = new Set(['verified', 'pending_review'])

function assertDecidable(claim: Claim): void {
  if (!DECIDABLE.has(claim.status)) {
    throw badRequest(
      `Claim ${claim.claimNumber} is "${claim.status}" and is no longer open for a decision.`,
    )
  }
}

/**
 * `POST /api/claims/:id/review` with `decision: "approve"`.
 *
 * The backend auto-creates the pending payment on approval, so nothing here
 * needs to — the payment index is just invalidated so it shows up.
 */
export async function approveClaim(
  insurerId: string,
  claimId: string,
  _reviewerName: string,
  body: { reason: string; approvedAmount?: number },
): Promise<Claim> {
  if (!body.reason.trim()) throw badRequest('An approval must record a reason.')

  const existing = await http<WireClaim>(`/api/claims/${claimId}`)
  if (!existing || !visibleToInsurer(existing, insurerId)) throw notFound('Claim', claimId)

  const approvedAmount = body.approvedAmount ?? existing.claimAmount
  if (approvedAmount < 0 || approvedAmount > existing.claimAmount) {
    throw badRequest('The approved amount must be between zero and the amount claimed.')
  }

  const claim = await http<WireClaim>(`/api/claims/${claimId}/review`, {
    method: 'POST',
    body: { decision: 'approve', approvedAmount, reviewerNote: body.reason.trim() },
  })
  invalidatePayments()
  return hydrateClaim(claim)
}

export async function rejectClaim(
  insurerId: string,
  claimId: string,
  _reviewerName: string,
  body: { reason: string },
): Promise<Claim> {
  if (!body.reason.trim()) throw badRequest('A rejection must record a reason.')

  const existing = await http<WireClaim>(`/api/claims/${claimId}`)
  if (!existing || !visibleToInsurer(existing, insurerId)) throw notFound('Claim', claimId)

  const claim = await http<WireClaim>(`/api/claims/${claimId}/review`, {
    method: 'POST',
    body: { decision: 'reject', reviewerNote: body.reason.trim() },
  })
  return hydrateClaim(claim)
}

/**
 * "Request more information."
 *
 * There is no backend transition for this, by design: the claim stays in
 * `REQUIRES_REVIEW` and the query is a note, not a state. Since the backend has
 * no endpoint for such a note either, this resolves locally — the claim is
 * re-read and returned with the query attached as its pending decision, so the
 * reviewer sees their own message, but nothing is persisted.
 *
 * That is a real gap, and it is left visible rather than papered over: making
 * it durable needs a `POST /api/claims/:id/notes` on the backend.
 */
export async function requestMoreInfo(
  insurerId: string,
  claimId: string,
  reviewerName: string,
  body: { reason: string },
): Promise<Claim> {
  if (!body.reason.trim()) throw badRequest('Describe what additional information is needed.')

  const wire = await http<WireClaim>(`/api/claims/${claimId}`)
  if (!wire || !visibleToInsurer(wire, insurerId)) throw notFound('Claim', claimId)

  const claim = await hydrateClaim(wire)
  assertDecidable(claim)

  return {
    ...claim,
    decision: {
      outcome: 'more_info_requested',
      reason: body.reason.trim(),
      reviewerName,
      decidedAt: new Date().toISOString(),
    },
  }
}

/* --------------------------------------------------------------- members */

/** `GET /api/patients` — the directory the policy form's insured-party picker
 * needs. This is the route that closed the gap the mock layer flagged. */
export async function getMembers(query: ListQuery = {}): Promise<Paginated<Patient>> {
  const wire = await http<WirePatient[]>('/api/patients', { query: { q: query.q } })
  const rows = (wire ?? []).map((p) => {
    cache.patients.put(p.id, p)
    return toPatient(p)
  })
  return paginate(rows, query)
}

/* -------------------------------------------------------------- policies */

async function hydratePolicy(policy: WirePolicy): Promise<Policy> {
  cache.policies.put(policy.id, policy)
  const [insurer, holder, tpa] = await Promise.all([
    organizationName(policy.insuranceOrganizationId),
    patientName(policy.patientRef),
    policy.tpaOrganizationId ? organizationName(policy.tpaOrganizationId) : Promise.resolve(null),
  ])
  return toPolicy(policy, { insurerName: insurer, holderName: holder, tpaName: tpa }, TRUTH_SCORE_THRESHOLD)
}

export async function getPolicies(
  insurerId: string,
  query: ListQuery = {},
): Promise<Paginated<Policy>> {
  const wire = await http<WirePolicy[]>('/api/policies')
  const policies = await Promise.all(
    (wire ?? []).filter((p) => p.insuranceOrganizationId === insurerId).map(hydratePolicy),
  )
  const rows = policies
    .filter((p) => (query.status ? p.status === query.status : true))
    .filter((p) => matches(query.q, p.policyNumber, p.holderName, p.coverageType))
  return paginate(rows, query)
}

export async function getPolicyById(insurerId: string, policyId: string): Promise<Policy> {
  const policy = await http<WirePolicy>(`/api/policies/${policyId}`)
  if (!policy || policy.insuranceOrganizationId !== insurerId) throw notFound('Policy', policyId)
  return hydratePolicy(policy)
}

export type PolicyPayload = Omit<
  Policy,
  'id' | 'insurerId' | 'insurerName' | 'holderName' | 'tpaName' | 'currency'
>

/**
 * `POST /api/policies`.
 *
 * `truthScoreThreshold` is accepted from the form but not sent: the backend
 * applies one platform-wide score threshold and only lets a policy override the
 * *amount* gate (`requiresReviewAbove`, which is what `autoApproveLimit` maps
 * to). Silently sending a field the backend ignores would be worse than not
 * sending it — see `live/config.ts` for the standing note on this.
 *
 * `coveredTreatmentTypes` is likewise not on the UI's form, so it is omitted,
 * which the backend reads as "every treatment type is covered".
 */
export async function createPolicy(
  _insurerId: string,
  _insurerName: string,
  payload: PolicyPayload,
): Promise<Policy> {
  if (payload.autoApproveLimit > payload.coverageLimit) {
    throw badRequest('The auto-approval limit cannot exceed the annual coverage limit.')
  }
  if (payload.tpaApprovalLimit !== null && payload.tpaApprovalLimit > payload.coverageLimit) {
    throw badRequest('The TPA approval limit cannot exceed the annual coverage limit.')
  }

  const policy = await http<WirePolicy>('/api/policies', {
    method: 'POST',
    body: {
      name: payload.name,
      policyNumber: payload.policyNumber,
      productPlanId: payload.productPlanId,
      patientRef: payload.holderPatientId,
      coverageType: payload.coverageType,
      annualPremium: payload.annualPremium,
      coverageStart: payload.startDate,
      coverageEnd: payload.endDate,
      maximumCoverage: payload.coverageLimit,
      deductible: payload.deductible,
      requiresReviewAbove: payload.autoApproveLimit,
      tpaOrganizationId: payload.tpaOrganizationId,
      tpaApprovalLimit: payload.tpaApprovalLimit,
    },
  })
  return hydratePolicy(policy)
}

/** `GET /api/identity/organizations?type=TPA` — the picker on the New Policy
 * form needs to know which TPAs exist before an insurer can delegate to one. */
export async function listTpaOrganizations(): Promise<{ id: string; name: string }[]> {
  const orgs = await http<{ id: string; name: string }[]>('/api/identity/organizations', {
    query: { type: 'TPA' },
  })
  return orgs ?? []
}

/**
 * The backend has no `PATCH /api/policies/:id` — a policy's terms are what a
 * claim was verified against, so editing one in place would silently rewrite
 * the basis of decisions already made.
 *
 * Rather than fake success, this fails with a message that says what to do
 * instead. The policy edit form surfaces it directly.
 */
export async function updatePolicy(
  _insurerId: string,
  _policyId: string,
  _patch: Partial<PolicyPayload>,
): Promise<Policy> {
  throw badRequest(
    'Policies cannot be edited once issued — a claim may already have been verified against these terms. Issue a new policy for the member instead.',
  )
}
